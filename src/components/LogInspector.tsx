'use client';

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Icon } from './Icon';
import './theme.css';
import {
	terminalStore,
	unreadErrorCount,
	markErrorsRead,
	clientConfig,
	getSavedRecordsLimit,
	setSavedRecordsLimit,
	initClientLogging,
	type InitClientOptions
} from '../client';
import {
	columns,
	comparators,
	parseLogEntry,
	DEFAULT_COL_WIDTHS,
	COMPACT_COL_WIDTHS,
	type LogColumn,
	type ParsedLog,
	type SortDir,
	type SortKey
} from './logUtils';
import { NetworkTable } from './NetworkTable';
import { RequestResponsePanel } from './RequestResponsePanel';

export interface LogInspectorProps {
	className?: string;
	options?: InitClientOptions;
}

export function LogInspector({ className = '', options }: LogInspectorProps) {
	if (process.env.NODE_ENV === 'production') return null;

	const logs = useSyncExternalStore(terminalStore.subscribe, terminalStore.getSnapshot, terminalStore.getServerSnapshot);
	const unreadErrors = useSyncExternalStore(unreadErrorCount.subscribe, unreadErrorCount.getSnapshot, unreadErrorCount.getServerSnapshot);

	const [searchQuery, setSearchQuery] = useState('');
	const [filterTag, setFilterTag] = useState('ALL');
	const [filterMethod, setFilterMethod] = useState('ALL');
	const [filterStatus, setFilterStatus] = useState('ALL');
	const [filterInitiator, setFilterInitiator] = useState('ALL');

	// Theme & UI settings
	const THEME_KEY = 'li-theme';
	const [isDark, setIsDark] = useState(true);
	const [collapsed, setCollapsed] = useState(false);
	const [fullscreen, setFullscreen] = useState(false);

	// Settings modal / popover state
	const [showSettings, setShowSettings] = useState(false);
	const [persistEnabled, setPersistEnabled] = useState(true);
	const [savedRecordsLimit, setSavedRecordsLimitState] = useState(10);

	const [mounted, setMounted] = useState(false);

	const [sortColumn, setSortColumn] = useState<SortKey>('timestamp');
	const [sortDir, setSortDir] = useState<SortDir>('desc');

	// Resizable table column widths (px)
	const [colWidths, setColWidths] = useState<Record<string, number>>({ ...DEFAULT_COL_WIDTHS });

	const [selectedLog, setSelectedLog] = useState<ParsedLog | null>(null);

	const logsContainerRef = useRef<HTMLDivElement | null>(null);

	const [inspectWidth, setInspectWidth] = useState(420);
	const inspectResize = useRef<{ startX: number; startWidth: number; minWidth: number; maxWidth: number } | null>(null);

	const [panelHeight, setPanelHeight] = useState(320);
	const heightResize = useRef<{ startY: number; startHeight: number } | null>(null);

	const [toastMsg, setToastMsg] = useState('');
	const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

	const [hasAutoSelected, setHasAutoSelected] = useState(false);

	const parsedLogs = useMemo(() => logs.map((l, idx) => parseLogEntry(l, idx)), [logs]);

	const initiatorOptions = useMemo(
		() =>
			[...new Set(parsedLogs.map((l) => l.initiator).filter((i) => !!i))].sort((a, b) =>
				a.toLowerCase().localeCompare(b.toLowerCase())
			),
		[parsedLogs]
	);

	const tagOptions = useMemo(() => [...new Set(parsedLogs.map((l) => l.tag))].sort(), [parsedLogs]);

	const filteredLogs = useMemo(() => {
		let result = parsedLogs;

		if (searchQuery.trim()) {
			const q = searchQuery.toLowerCase();
			result = result.filter(
				(l) =>
					l.message.toLowerCase().includes(q) ||
					l.url.toLowerCase().includes(q) ||
					l.tag.toLowerCase().includes(q) ||
					l.method.toLowerCase().includes(q) ||
					l.initiator.toLowerCase().includes(q) ||
					l.statusText.toLowerCase().includes(q) ||
					(l.raw.details && l.raw.details.toLowerCase().includes(q))
			);
		}

		if (filterTag !== 'ALL') {
			result = result.filter((l) => l.tag === filterTag);
		}

		if (filterMethod !== 'ALL') {
			result = result.filter((l) => l.method === filterMethod);
		}

		if (filterStatus === 'SUCCESS') {
			result = result.filter((l) => l.isSuccess);
		} else if (filterStatus === 'ERROR') {
			result = result.filter((l) => l.isError);
		}

		if (filterInitiator !== 'ALL') {
			result = result.filter((l) => l.initiator === filterInitiator);
		}

		return [...result].sort((a, b) => {
			const cmp = comparators[sortColumn](a, b);
			return sortDir === 'asc' ? cmp : -cmp;
		});
	}, [parsedLogs, searchQuery, filterTag, filterMethod, filterStatus, filterInitiator, sortColumn, sortDir]);

	useEffect(() => {
		setMounted(true);
		if (typeof window !== 'undefined') {
			if (localStorage.getItem(THEME_KEY) === 'light') setIsDark(false);
			setSavedRecordsLimitState(getSavedRecordsLimit());
			setPersistEnabled(clientConfig.persist);

			const cleanup = initClientLogging(options);
			return cleanup;
		}
	}, []);

	useEffect(() => {
		if (selectedLog) {
			setColWidths({ ...COMPACT_COL_WIDTHS });
		} else {
			setColWidths({ ...DEFAULT_COL_WIDTHS });
		}
	}, [selectedLog]);

	useEffect(() => {
		if (showSettings) {
			const handleOutsideClick = () => {
				setShowSettings(false);
			};
			window.addEventListener('click', handleOutsideClick);
			return () => window.removeEventListener('click', handleOutsideClick);
		}
	}, [showSettings]);

	useEffect(() => {
		if (filteredLogs.length > 0) {
			if (!selectedLog && !hasAutoSelected) {
				setSelectedLog(filteredLogs[0]);
				setHasAutoSelected(true);
			} else if (selectedLog && !filteredLogs.some((l) => l.index === selectedLog?.index)) {
				setSelectedLog(filteredLogs[0] || null);
			}
		} else if (filteredLogs.length === 0) {
			setSelectedLog(null);
		}
	}, [filteredLogs, selectedLog, hasAutoSelected]);

	if (!mounted) return <div id="nextjs-log-inspector-root" suppressHydrationWarning />;

	function toggleTheme() {
		setIsDark((prev) => {
			const next = !prev;
			if (typeof window !== 'undefined') {
				localStorage.setItem(THEME_KEY, next ? 'dark' : 'light');
			}
			return next;
		});
	}

	function handleLimitChange(newLimit: number) {
		setSavedRecordsLimitState(newLimit);
		setSavedRecordsLimit(newLimit);
		terminalStore.rePersist();
		showToast(`Saved records limit set to ${newLimit}`);
	}

	function handleTogglePersist() {
		setPersistEnabled((prev) => {
			const next = !prev;
			clientConfig.persist = next;
			if (!next) {
				if (typeof window !== 'undefined') {
					localStorage.removeItem(clientConfig.storageKey);
				}
				showToast('Log persistence disabled');
			} else {
				terminalStore.rePersist();
				showToast('Log persistence enabled');
			}
			return next;
		});
	}

	function handleClearSavedRecords() {
		if (typeof window !== 'undefined') {
			localStorage.removeItem(clientConfig.storageKey);
		}
		showToast('Saved storage cleared');
	}

	function handleClear() {
		terminalStore.clear();
		setSelectedLog(null);
		showToast('All records cleared');
	}

	function toggleFullscreen() {
		setFullscreen((prev) => {
			const next = !prev;
			if (typeof window !== 'undefined') {
				document.body.style.overflow = next ? 'hidden' : '';
			}
			return next;
		});
	}

	function handleInspectResizeStart(e: React.MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		const containerWidth = logsContainerRef.current?.clientWidth || (typeof window !== 'undefined' ? window.innerWidth : 1000);

		// Boundaries:
		// Left Table Panel min-width: 320px
		// Right Inspect Panel min-width: 320px, max-width: 60% of container (leaving at least 320px for table)
		const minWidth = 320;
		const maxWidth = Math.max(minWidth, Math.min(Math.floor(containerWidth * 0.6), containerWidth - 320));

		inspectResize.current = { startX: e.clientX, startWidth: inspectWidth, minWidth, maxWidth };

		window.addEventListener('mousemove', onInspectResizeMove);
		window.addEventListener('mouseup', onInspectResizeEnd);
		document.body.style.userSelect = 'none';
		document.body.style.cursor = 'col-resize';
	}

	function onInspectResizeMove(e: MouseEvent) {
		const d = inspectResize.current;
		if (!d) return;
		const delta = d.startX - e.clientX;
		setInspectWidth(Math.min(Math.max(d.startWidth + delta, d.minWidth), d.maxWidth));
	}

	function onInspectResizeEnd() {
		inspectResize.current = null;
		window.removeEventListener('mousemove', onInspectResizeMove);
		window.removeEventListener('mouseup', onInspectResizeEnd);
		document.body.style.userSelect = '';
		document.body.style.cursor = '';
	}

	function handleHeightResizeStart(e: React.MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		const minHeight = 150;
		const maxHeight = Math.max(minHeight, Math.floor(window.innerHeight * 0.95));
		
		let startHeight = panelHeight;
		if (fullscreen) {
			startHeight = window.innerHeight;
			setPanelHeight(startHeight);
			setFullscreen(false);
			document.body.style.overflow = '';
		}

		heightResize.current = { startY: e.clientY, startHeight };

		function onMouseMove(moveEvent: MouseEvent) {
			const d = heightResize.current;
			if (!d) return;
			const delta = d.startY - moveEvent.clientY;
			setPanelHeight(Math.min(Math.max(d.startHeight + delta, minHeight), maxHeight));
		}

		function onMouseUp() {
			heightResize.current = null;
			window.removeEventListener('mousemove', onMouseMove);
			window.removeEventListener('mouseup', onMouseUp);
			document.body.style.userSelect = '';
			document.body.style.cursor = '';
		}

		document.body.style.userSelect = 'none';
		document.body.style.cursor = 'ns-resize';
		window.addEventListener('mousemove', onMouseMove);
		window.addEventListener('mouseup', onMouseUp);
	}

	function showToast(msg: string) {
		setToastMsg(msg);
		clearTimeout(toastTimer.current);
		toastTimer.current = setTimeout(() => setToastMsg(''), 1600);
	}

	function copyText(text: string, e?: React.MouseEvent) {
		if (e) e.stopPropagation();
		navigator.clipboard
			.writeText(text)
			.then(() => showToast('Copied to clipboard'))
			.catch(() => showToast('Copy failed'));
	}

	function handleSort(col: LogColumn) {
		if (!col.sortable) return;
		toggleSort(col.key as SortKey);
	}

	function toggleSort(col: SortKey) {
		if (sortColumn === col) {
			setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
		} else {
			setSortColumn(col);
			setSortDir('desc');
		}
	}

	function openTrace(log: ParsedLog) {
		setSelectedLog(log);
	}

	function toggleLogExpanded(index: number) {
		terminalStore.update((current) => {
			const next = [...current];
			const l = next[index];
			if (l) l.expanded = !l.expanded;
			return next;
		});
	}

	const hasActiveFilters =
		searchQuery || filterMethod !== 'ALL' || filterStatus !== 'ALL' || filterTag !== 'ALL' || filterInitiator !== 'ALL';

	if (collapsed) {
		return (
			<div
				onClick={() => {
					setCollapsed(false);
					markErrorsRead();
				}}
				className={`fixed bottom-0 left-0 right-0 z-[9999] flex items-center justify-between px-3 h-9 bg-theme-surface border-t border-theme-border shadow-2xl cursor-pointer hover:bg-theme-bg transition-colors ${isDark ? '' : 'li-light'} ${className}`}
				title="Click to expand inspector"
			>
				<div className="flex items-center gap-2 text-[10px] text-theme-text-muted font-mono pointer-events-none">
					<span>{logs.length} logs</span>
				</div>

				<div className="flex items-center gap-2">
					{unreadErrors > 0 && (
						<span className="px-1.5 py-0.5 rounded-full bg-rose-500/20 text-rose-400 text-[10px] font-bold">
							{unreadErrors} {unreadErrors === 1 ? 'error' : 'errors'}
						</span>
					)}

					<button
						className="p-1 hover:bg-theme-border/50 rounded text-theme-text-muted hover:text-theme-text-primary transition-colors flex items-center gap-1.5"
						title="Expand inspector"
					>
						<span className="text-[10px] uppercase tracking-wide text-theme-text-muted font-semibold">Log Inspector</span>
						<Icon icon="panel-bottom-open" className="h-3.5 w-3.5" />
					</button>
				</div>
			</div>
		);
	}

	return (
		<div
			className={`fixed bottom-0 left-0 right-0 z-[9999] flex flex-col min-w-0 overflow-hidden bg-theme-bg border-t border-theme-border shadow-2xl ${className} ${isDark ? '' : 'li-light'} ${fullscreen ? '!fixed !inset-0 !z-[9999] !h-screen !w-screen' : ''}`}
			style={fullscreen ? undefined : { height: `${panelHeight}px` }}
		>
			{/* Height resize handle */}
			<div
				onMouseDown={handleHeightResizeStart}
				style={{ cursor: 'ns-resize' }}
				className="h-1.5 shrink-0 bg-theme-border/40 hover:bg-indigo-500 active:bg-indigo-600 cursor-ns-resize cursor-row-resize transition-colors z-10 flex items-center justify-center group select-none"
				title="Drag to resize panel height"
			>
				<div className="w-8 h-0.5 bg-theme-text-muted/40 group-hover:bg-white rounded-full" />
			</div>

			{/* Toast */}
			{toastMsg && (
				<div className="fixed top-4 right-4 z-[999] bg-theme-surface border border-theme-border rounded-lg px-3 py-2 text-[11px] text-theme-text-primary shadow-2xl">
					{toastMsg}
				</div>
			)}

			{/* Filtering & Search Control Toolbar */}
			<div className="flex items-center gap-2 px-3 py-1.5 bg-theme-surface/70 border-b border-theme-border/70 shrink-0 text-[11px] flex-wrap">
				{/* Search Input */}
				<div className="relative flex-1 min-w-[160px] max-w-xs">
					<div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
						<Icon icon="search" className="h-3.5 w-3.5 text-theme-text-muted" />
					</div>
					<input
						type="text"
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						placeholder="Search logs, URLs, status..."
						className="w-full pl-8 pr-7 py-1 bg-theme-bg border border-theme-border rounded text-[11px] text-theme-text-primary placeholder:text-theme-text-muted outline-none focus:border-theme-accent transition-colors"
					/>
					{searchQuery && (
						<div className="absolute inset-y-0 right-0 pr-2 flex items-center">
							<button
								onClick={() => setSearchQuery('')}
								className="text-theme-text-muted hover:text-theme-text-primary cursor-pointer p-0.5 rounded flex items-center justify-center"
							>
								<Icon icon="x" className="h-3 w-3" />
							</button>
						</div>
					)}
				</div>

				{/* Method Filter */}
				<div className="flex items-center gap-1">
					<span className="text-theme-text-muted text-[10px] font-medium">Method:</span>
					<select
						value={filterMethod}
						onChange={(e) => setFilterMethod(e.target.value)}
						className="bg-theme-bg border border-theme-border rounded px-2 py-1 text-[11px] text-theme-text-primary outline-none focus:border-theme-accent cursor-pointer"
					>
						<option value="ALL">All Methods</option>
						<option value="GET">GET</option>
						<option value="POST">POST</option>
						<option value="PUT">PUT</option>
						<option value="DELETE">DELETE</option>
						<option value="PATCH">PATCH</option>
					</select>
				</div>

				{/* Status Filter */}
				<div className="flex items-center gap-1">
					<span className="text-theme-text-muted text-[10px] font-medium">Status:</span>
					<select
						value={filterStatus}
						onChange={(e) => setFilterStatus(e.target.value)}
						className="bg-theme-bg border border-theme-border rounded px-2 py-1 text-[11px] text-theme-text-primary outline-none focus:border-theme-accent cursor-pointer"
					>
						<option value="ALL">All Status</option>
						<option value="SUCCESS">Success (2xx)</option>
						<option value="ERROR">Errors (4xx / 5xx)</option>
					</select>
				</div>

				{/* Tag Filter */}
				<div className="flex items-center gap-1">
					<span className="text-theme-text-muted text-[10px] font-medium">Tag:</span>
					<select
						value={filterTag}
						onChange={(e) => setFilterTag(e.target.value)}
						className="bg-theme-bg border border-theme-border rounded px-2 py-1 text-[11px] text-theme-text-primary outline-none focus:border-theme-accent cursor-pointer"
					>
						<option value="ALL">All Tags</option>
						{tagOptions.map((opt) => (
							<option key={opt} value={opt}>
								{opt}
							</option>
						))}
					</select>
				</div>

				{/* Initiator Filter (Last Filter Option) */}
				<div className="flex items-center gap-1">
					<span className="text-theme-text-muted text-[10px] font-medium">Initiator:</span>
					<select
						value={filterInitiator}
						onChange={(e) => setFilterInitiator(e.target.value)}
						className="bg-theme-bg border border-theme-border rounded px-2 py-1 text-[11px] text-theme-text-primary outline-none focus:border-theme-accent cursor-pointer"
					>
						<option value="ALL">All Initiators</option>
						{initiatorOptions.map((opt) => (
							<option key={opt} value={opt}>
								{opt}
							</option>
						))}
					</select>
				</div>

				{/* Settings Button (Sitting with last filter option) */}
				<div className="relative flex items-center">
					<button
						onClick={(e) => {
							e.stopPropagation();
							setShowSettings(!showSettings);
						}}
						className="flex items-center gap-1.5 px-2 py-1 bg-theme-bg border border-theme-border rounded text-[11px] text-theme-text-primary hover:border-theme-accent transition-colors cursor-pointer"
						title="Inspector Settings"
					>
						<Icon icon="settings" className="h-3.5 w-3.5 text-indigo-400" />
						<span>Settings</span>
					</button>

					{showSettings && (
						<div
							className="absolute top-full left-0 mt-1.5 w-64 p-3 bg-theme-surface border border-theme-border rounded-lg shadow-2xl z-50 text-[11px] space-y-3 font-sans"
							onClick={(e) => e.stopPropagation()}
						>
							<div className="flex items-center justify-between border-b border-theme-border/60 pb-1.5">
								<span className="font-semibold text-theme-text-primary flex items-center gap-1.5 text-xs">
									<Icon icon="settings" className="h-3.5 w-3.5 text-indigo-400" />
									Preferences
								</span>
								<button onClick={() => setShowSettings(false)} className="text-theme-text-muted hover:text-theme-text-primary p-0.5 cursor-pointer">
									<Icon icon="x" className="h-3 w-3" />
								</button>
							</div>

							{/* Theme Selector */}
							<div className="space-y-1">
								<span className="text-[10px] font-medium text-theme-text-muted uppercase tracking-wider block">Theme Mode</span>
								<div className="flex items-center gap-1 bg-theme-bg p-1 rounded border border-theme-border/60">
									<button
										onClick={() => {
											if (!isDark) toggleTheme();
										}}
										className={`flex-1 flex items-center justify-center gap-1 py-1 rounded text-[10px] font-medium cursor-pointer transition-colors ${isDark ? 'bg-indigo-600 text-white font-semibold' : 'text-theme-text-muted hover:text-theme-text-primary'}`}
									>
										<Icon icon="moon" className="h-3 w-3" />
										<span>Dark</span>
									</button>
									<button
										onClick={() => {
											if (isDark) toggleTheme();
										}}
										className={`flex-1 flex items-center justify-center gap-1 py-1 rounded text-[10px] font-medium cursor-pointer transition-colors ${!isDark ? 'bg-indigo-600 text-white font-semibold' : 'text-theme-text-muted hover:text-theme-text-primary'}`}
									>
										<Icon icon="sun" className="h-3 w-3" />
										<span>Light</span>
									</button>
								</div>
							</div>

							{/* Persistence & Saved Records */}
							<div className="space-y-1.5 pt-1 border-t border-theme-border/40">
								<div className="flex items-center justify-between">
									<span className="text-[10px] font-medium text-theme-text-muted uppercase tracking-wider">Persist Logs Across Reload</span>
									<input
										type="checkbox"
										checked={persistEnabled}
										onChange={handleTogglePersist}
										className="accent-indigo-500 rounded cursor-pointer h-3.5 w-3.5"
									/>
								</div>

								<div className="flex items-center justify-between pt-1">
									<span className="text-theme-text-secondary text-[11px]">Saved Records Limit:</span>
									<select
										value={savedRecordsLimit}
										onChange={(e) => handleLimitChange(Number(e.target.value))}
										disabled={!persistEnabled}
										className="bg-theme-bg border border-theme-border rounded px-2 py-0.5 text-[11px] text-theme-text-primary outline-none focus:border-theme-accent cursor-pointer disabled:opacity-40"
									>
										<option value={5}>5 entries</option>
										<option value={10}>10 entries</option>
										<option value={25}>25 entries</option>
										<option value={50}>50 entries</option>
										<option value={100}>100 entries</option>
									</select>
								</div>

								<button
									onClick={handleClearSavedRecords}
									className="w-full mt-2 py-1 px-2 bg-theme-panel hover:bg-rose-500/10 border border-theme-border hover:border-rose-500/40 text-theme-text-secondary hover:text-rose-400 rounded text-[10px] font-medium transition-colors flex items-center justify-center gap-1 cursor-pointer"
								>
									<Icon icon="trash-2" className="h-3 w-3" />
									<span>Clear Saved Storage</span>
								</button>
							</div>
						</div>
					)}
				</div>

				{/* Reset Filters */}
				{hasActiveFilters && (
					<button
						onClick={() => {
							setSearchQuery('');
							setFilterMethod('ALL');
							setFilterStatus('ALL');
							setFilterTag('ALL');
							setFilterInitiator('ALL');
						}}
						className="text-[10px] text-indigo-400 hover:text-indigo-300 hover:underline cursor-pointer"
					>
						Reset Filters
					</button>
				)}

				{/* Action buttons (copy, clear, fullscreen, collapse) */}
				<div className="relative flex items-center gap-1 ml-auto shrink-0">
					<button
						onClick={(e) =>
							copyText(
								logs.map((l) => `[${l.timestamp}] ${l.message}${l.details ? '\n' + l.details : ''}`).join('\n\n'),
								e
							)
						}
						className="p-1 text-theme-text-muted hover:text-theme-text-primary hover:bg-theme-panel rounded cursor-pointer transition-colors"
						title="Copy all logs"
					>
						<Icon icon="copy" className="h-3.5 w-3.5" />
					</button>
					<button
						onClick={handleClear}
						className="p-1 text-theme-text-muted hover:text-theme-danger hover:bg-theme-panel rounded cursor-pointer transition-colors"
						title="Clear all records"
					>
						<Icon icon="trash-2" className="h-3.5 w-3.5" />
					</button>
					<button
						onClick={toggleFullscreen}
						className="p-1 text-theme-text-muted hover:text-theme-text-primary hover:bg-theme-panel rounded cursor-pointer transition-colors"
						title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
					>
						<Icon icon={fullscreen ? 'minimize-2' : 'maximize-2'} className="h-3.5 w-3.5" />
					</button>
					<button
						onClick={() => {
							setCollapsed(true);
							markErrorsRead();
						}}
						className="p-1 text-theme-text-muted hover:text-theme-text-primary hover:bg-theme-panel rounded cursor-pointer transition-colors"
						title="Collapse inspector"
					>
						<Icon icon="panel-bottom-close" className="h-3.5 w-3.5" />
					</button>
				</div>
			</div>

			{/* LOG CONTENT AREA (TOP FLEX WRAPPER) */}
			<div ref={logsContainerRef} className="flex-1 flex min-h-0 overflow-hidden">
				{/* LEFT FLEX PANEL: Log Table */}
				<div className="flex-1 flex flex-col min-w-[320px] shrink-0 min-h-0 overflow-hidden">
					<NetworkTable
						logs={filteredLogs}
						columns={columns}
						colWidths={colWidths}
						sortColumn={sortColumn}
						sortDir={sortDir}
						selectedIndex={selectedLog?.index ?? null}
						onSort={handleSort}
						onSelect={openTrace}
						onCopy={copyText}
						onToggleExpand={toggleLogExpanded}
						onResizeWidths={setColWidths}
					/>
				</div>

				{/* FLEX SPLITTER RESIZER (Middle Divider) */}
				{selectedLog && (
					<>
						<div
							onMouseDown={handleInspectResizeStart}
							className="w-1.5 shrink-0 bg-theme-border/60 hover:bg-indigo-500 active:bg-indigo-600 cursor-col-resize transition-colors z-10 flex items-center justify-center group select-none"
							title="Drag to resize panel"
						>
							<div className="w-0.5 h-6 bg-theme-text-muted/40 group-hover:bg-white rounded-full" />
						</div>

						{/* RIGHT FLEX PANEL: Inspect Detail Panel */}
						<div
							className="shrink-0 flex flex-col min-h-0 min-w-[320px] max-w-[40%] bg-theme-surface border-l border-theme-border/60 overflow-hidden"
							style={{ width: `${inspectWidth}px` }}
						>
							<RequestResponsePanel log={selectedLog} onClose={() => setSelectedLog(null)} onCopy={copyText} />
						</div>
					</>
				)}
			</div>
		</div>
	);
}

export default LogInspector;