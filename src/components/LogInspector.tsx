'use client';

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Icon } from './Icon';
import './inspector-theme.css';
import {
	terminalStore,
	unreadErrorCount,
	markErrorsRead,
	pendingCount,
	clientConfig,
	getSavedRecordsLimit,
	setSavedRecordsLimit,
	initClientLogging,
	isInspectorEnabled,
	startLogStream,
	stopLogStream,
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
import { FloatingDockButton } from './FloatingDockButton';
import { LogInspectorToolbar } from './LogInspectorToolbar';
import { SettingsPopover } from './SettingsPopover';
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
	const pending = useSyncExternalStore(pendingCount.subscribe, pendingCount.getSnapshot, pendingCount.getServerSnapshot);
	const enabled = useSyncExternalStore(isInspectorEnabled.subscribe, isInspectorEnabled.getSnapshot, isInspectorEnabled.getServerSnapshot);

	const [searchQuery, setSearchQuery] = useState('');
	const [filterTag, setFilterTag] = useState('ALL');
	const [filterMethod, setFilterMethod] = useState('ALL');
	const [filterStatus, setFilterStatus] = useState('ALL');
	const [filterInitiator, setFilterInitiator] = useState('ALL');

	// Theme & UI settings
	const THEME_KEY = 'li-theme';
	const COLLAPSE_KEY = 'li-collapsed';
	const [isDark, setIsDark] = useState(true);
	const [collapsed, setCollapsed] = useState(true);
		const [fullscreen, setFullscreen] = useState(false);

	// Settings modal / popover state
	const [showSettings, setShowSettings] = useState(false);
	const [persistEnabled, setPersistEnabled] = useState(true);
	const [savedRecordsLimit, setSavedRecordsLimitState] = useState(50);
	const [pingThreshold, setPingThreshold] = useState(1000);
	const [sizeThreshold, setSizeThreshold] = useState(100);

	const AUTO_POP_KEY = 'li-auto-pop';
	const OPEN_ON_START_KEY = 'li-open-on-start';
	const [autoPopOnError, setAutoPopOnError] = useState(false);
	const [openOnStartup, setOpenOnStartup] = useState(false);
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

		if (filterMethod === 'NETWORK_ONLY') {
			result = result.filter((l) => l.method !== '-');
		} else if (filterMethod === 'LOGS_ONLY') {
			result = result.filter((l) => l.method === '-');
		} else if (filterMethod !== 'ALL') {
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

			const savedSearch = localStorage.getItem('li-search');
			if (savedSearch) setSearchQuery(savedSearch);
			const savedTag = localStorage.getItem('li-filter-tag');
			if (savedTag) setFilterTag(savedTag);
			const savedMethod = localStorage.getItem('li-filter-method');
			if (savedMethod) setFilterMethod(savedMethod);
			const savedStatus = localStorage.getItem('li-filter-status');
			if (savedStatus) setFilterStatus(savedStatus);
			const savedInit = localStorage.getItem('li-filter-init');
			if (savedInit) setFilterInitiator(savedInit);
			
			const savedPing = localStorage.getItem('li-ping-thresh');
			if (savedPing && !isNaN(Number(savedPing))) setPingThreshold(Number(savedPing));
			const savedSize = localStorage.getItem('li-size-thresh');
			if (savedSize && !isNaN(Number(savedSize))) setSizeThreshold(Number(savedSize));

			const autoOpen = localStorage.getItem(OPEN_ON_START_KEY) === 'true';
			if (autoOpen) {
				setOpenOnStartup(true);
				setCollapsed(false);
			} else if (localStorage.getItem(COLLAPSE_KEY) === 'false') {
				setCollapsed(false);
			}

			if (localStorage.getItem(AUTO_POP_KEY) === 'true') setAutoPopOnError(true);
			setSavedRecordsLimitState(getSavedRecordsLimit());
			setPersistEnabled(clientConfig.persist);

			const cleanup = initClientLogging(options);
			return cleanup;
		}
	}, []);

	useEffect(() => {
		if (!mounted || typeof window === 'undefined') return;
		localStorage.setItem('li-search', searchQuery);
		localStorage.setItem('li-filter-tag', filterTag);
		localStorage.setItem('li-filter-method', filterMethod);
		localStorage.setItem('li-filter-status', filterStatus);
		localStorage.setItem('li-filter-init', filterInitiator);
	}, [searchQuery, filterTag, filterMethod, filterStatus, filterInitiator, mounted]);

	useEffect(() => {
		if (!mounted || typeof window === 'undefined') return;
		localStorage.setItem('li-ping-thresh', String(pingThreshold));
		localStorage.setItem('li-size-thresh', String(sizeThreshold));
	}, [pingThreshold, sizeThreshold, mounted]);

	useEffect(() => {
		if (selectedLog) {
			setColWidths({ ...COMPACT_COL_WIDTHS });
		} else {
			setColWidths({ ...DEFAULT_COL_WIDTHS });
		}
	}, [selectedLog]);

	useEffect(() => {
		if (autoPopOnError && collapsed && unreadErrors > 0) {
			setCollapsed(false);
			markErrorsRead();
		}
	}, [unreadErrors, autoPopOnError, collapsed]);

	useEffect(() => {
		if (showSettings) {
			const handleOutsideClick = () => {
				setShowSettings(false);
			};
			window.addEventListener('click', handleOutsideClick);
		

	return (
) => window.removeEventListener('click', handleOutsideClick);
		}
	}, [showSettings]);

	useEffect(() => {
		if (mounted && typeof window !== 'undefined') {
			localStorage.setItem(COLLAPSE_KEY, String(collapsed));
		}
	}, [collapsed, mounted]);

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

	function handleToggleAutoPop() {
		setAutoPopOnError((prev) => {
			const next = !prev;
			if (typeof window !== 'undefined') {
				localStorage.setItem(AUTO_POP_KEY, String(next));
			}
			showToast(next ? 'Auto-pop on error enabled' : 'Auto-pop on error disabled');
			return next;
		});
	}

	function handleToggleOpenOnStartup() {
		setOpenOnStartup((prev) => {
			const next = !prev;
			if (typeof window !== 'undefined') {
				localStorage.setItem(OPEN_ON_START_KEY, String(next));
			}
			showToast(next ? 'Popup at start enabled' : 'Popup at start disabled');
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
		!!searchQuery || filterMethod !== 'ALL' || filterStatus !== 'ALL' || filterTag !== 'ALL' || filterInitiator !== 'ALL';

	return (
		<div id="nextjs-log-inspector-root">
			<style dangerouslySetInnerHTML={{ __html: `
				/* Force font sizes to bypass Service Worker cache */
				#nextjs-log-inspector-root .text-li-body,
				#nextjs-log-inspector-root .text-table-body {
					font-size: 9px !important;
				}
				#nextjs-log-inspector-root .text-pill {
					font-size: 8px !important;
				}
				/* Force font-family to prevent host app bleeding */
				#nextjs-log-inspector-root .font-mono,
				#nextjs-log-inspector-root .font-mono * {
					font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace !important;
				}
			`}} />
			<FloatingDockButton
				collapsed={collapsed}
				setCollapsed={setCollapsed}
				markErrorsRead={markErrorsRead}
				isDark={isDark}
				className={className}
				enabled={enabled}
				setEnabled={(val) => isInspectorEnabled.set(val)}
			/>

			{!collapsed && (
				<div
					className={`fixed bottom-0 left-0 right-0 flex flex-col min-w-0 overflow-hidden bg-theme-bg border-t border-theme-border shadow-2xl ${className} ${isDark ? '' : 'li-light'} ${fullscreen ? '!fixed !inset-0 !h-screen !w-screen' : ''}`}
					style={{ 
						zIndex: 2147483647,
						colorScheme: isDark ? 'dark' : 'light',
						...(fullscreen ? {} : { height: `${panelHeight}px` }),
						opacity: 1,
					}}
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
				<div className="fixed top-4 right-4 z-[2147483647] bg-theme-surface border border-theme-border rounded-lg px-3 py-2 text-li-body text-theme-text-primary shadow-2xl">
					{toastMsg}
				</div>
			)}

			<LogInspectorToolbar
						searchQuery={searchQuery}
						setSearchQuery={setSearchQuery}
						filterMethod={filterMethod}
						setFilterMethod={setFilterMethod}
						filterStatus={filterStatus}
						setFilterStatus={setFilterStatus}
						filterTag={filterTag}
						setFilterTag={setFilterTag}
						filterInitiator={filterInitiator}
						setFilterInitiator={setFilterInitiator}
						tagOptions={tagOptions}
						initiatorOptions={initiatorOptions}
						hasActiveFilters={hasActiveFilters}
						fullscreen={fullscreen}
							toggleFullscreen={toggleFullscreen}
						
					
						setCollapsed={setCollapsed}
						markErrorsRead={markErrorsRead}
						copyAllLogs={(e) => copyText(logs.map((l) => `[${l.timestamp}] ${l.message}`).join('\n'), e as any)}
						handleClear={handleClear}
					>
						<div className="relative flex items-center">
							<button
								onClick={(e) => {
									e.stopPropagation();
									setShowSettings(!showSettings);
								}}
								className="flex items-center gap-1.5 ml-6 px-2 py-1 bg-theme-bg border border-theme-border rounded text-li-body text-theme-text-primary hover:border-theme-accent transition-colors cursor-pointer"
								title="Inspector Settings"
							>
								<Icon icon="settings" className="h-3.5 w-3.5 text-indigo-400" />
				
							</button>
							<SettingsPopover
								showSettings={showSettings}
								setShowSettings={setShowSettings}
								isDark={isDark}
								toggleTheme={toggleTheme}
								persistEnabled={persistEnabled}
								handleTogglePersist={handleTogglePersist}
								openOnStartup={openOnStartup}
								handleToggleOpenOnStartup={handleToggleOpenOnStartup}
								autoPopOnError={autoPopOnError}
								handleToggleAutoPop={handleToggleAutoPop}
								savedRecordsLimit={savedRecordsLimit}
								handleLimitChange={handleLimitChange}
								handleClearSavedRecords={handleClearSavedRecords}
								pingThreshold={pingThreshold}
								setPingThreshold={setPingThreshold}
								sizeThreshold={sizeThreshold}
								setSizeThreshold={setSizeThreshold}
							/>
						</div>
					</LogInspectorToolbar>
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
						pingThreshold={pingThreshold}
						sizeThreshold={sizeThreshold}
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
			)}
		</div>
	);
}

export default LogInspector;