import { Fragment, useRef } from 'react';
import { Icon } from './Icon';
import { getMethodBadgeClass, type LogColumn, type ParsedLog, type SortDir, type SortKey } from './logUtils';

export interface NetworkTableProps {
	logs: ParsedLog[];
	columns: LogColumn[];
	colWidths: Record<string, number>;
	sortColumn: SortKey;
	sortDir: SortDir;
	selectedIndex: number | null;
	onSort: (col: LogColumn) => void;
	onSelect: (log: ParsedLog) => void;
	onCopy: (text: string, e?: React.MouseEvent) => void;
	onToggleExpand: (index: number) => void;
	onResizeWidths: (widths: Record<string, number>) => void;
}

export function NetworkTable({
	logs,
	columns,
	colWidths,
	sortColumn,
	sortDir,
	selectedIndex,
	onSort,
	onSelect,
	onCopy,
	onToggleExpand,
	onResizeWidths
}: NetworkTableProps) {
	const drag = useRef<{ col: string; nextCol: string; startX: number; startWidth: number; startNextWidth: number } | null>(null);

	function startColResize(e: React.MouseEvent, col: string) {
		e.preventDefault();
		e.stopPropagation();

		const colIndex = columns.findIndex((c) => c.key === col);
		if (colIndex === -1 || colIndex >= columns.length - 1) return;

		const nextCol = columns[colIndex + 1].key;

		drag.current = {
			col,
			nextCol,
			startX: e.clientX,
			startWidth: colWidths[col] ?? 120,
			startNextWidth: colWidths[nextCol] ?? 120
		};

		window.addEventListener('mousemove', onColResizeMove);
		window.addEventListener('mouseup', endColResize);
		document.body.style.cursor = 'col-resize';
		document.body.style.userSelect = 'none';
	}

	function onColResizeMove(e: MouseEvent) {
		const d = drag.current;
		if (!d) return;
		const rawDelta = e.clientX - d.startX;

		const minWidthCurrent = 48;
		const minWidthNext = 48;
		const totalPairWidth = d.startWidth + d.startNextWidth;

		let newCurrentWidth = Math.min(Math.max(d.startWidth + rawDelta, minWidthCurrent), totalPairWidth - minWidthNext);
		let newNextWidth = totalPairWidth - newCurrentWidth;

		onResizeWidths({
			...colWidths,
			[d.col]: newCurrentWidth,
			[d.nextCol]: newNextWidth
		});
	}

	function endColResize() {
		drag.current = null;
		window.removeEventListener('mousemove', onColResizeMove);
		window.removeEventListener('mouseup', endColResize);
		document.body.style.cursor = '';
		document.body.style.userSelect = '';
	}

	return (
		<div className="flex-1 overflow-auto scrollbar-thin shrink-0">
			<table className="w-full table-fixed border-collapse text-left font-mono text-[11px] leading-snug">
				<thead className="sticky top-0 z-10 text-[10px] uppercase text-theme-text-muted select-none bg-theme-surface">
					<tr>
						{columns.map((col) =>
							col.sortable ? (
								<th
									key={col.key}
									onClick={() => onSort(col)}
									style={{ width: `${colWidths[col.key]}px` }}
									className={`relative ${col.grow ? '' : 'whitespace-nowrap'} py-1.5 px-4 cursor-pointer hover:text-theme-text-primary transition-colors`}
								>
									<div className="flex items-center gap-1">
										<span>{col.label}</span>
										<span className="w-3 shrink-0 inline-flex">
											{sortColumn === col.key && (
												<Icon icon={sortDir === 'asc' ? 'chevron-up' : 'chevron-down'} className="h-3 w-3 text-indigo-400" />
											)}
										</span>
									</div>
									<div
										onMouseDown={(e) => startColResize(e, col.key)}
										onClick={(e) => e.stopPropagation()}
										className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-theme-accent/60 transition-colors"
									/>
								</th>
							) : (
								<th
									key={col.key}
									style={{ width: `${colWidths[col.key]}px` }}
									className="relative py-1.5 px-4 text-center whitespace-nowrap"
								>
									{col.label}
									<div
										onMouseDown={(e) => startColResize(e, col.key)}
										onClick={(e) => e.stopPropagation()}
										className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-theme-accent/60 transition-colors"
									/>
								</th>
							)
						)}
					</tr>
				</thead>
				<tbody className="">
					{logs.length === 0 && (
						<tr>
							<td colSpan={8} className="py-8 text-center text-theme-text-muted italic text-[11px]">
								No logs found matching filter criteria.
							</td>
						</tr>
					)}
					{logs.map((log) => (
						<Fragment key={log.index}>
							<tr
								key={log.index}
								onClick={() => onSelect(log)}
								className={`cursor-pointer transition-colors border-b border-theme-border/20 ${selectedIndex === log.index ? 'bg-theme-surface' : 'hover:bg-theme-surface/50'} group`}
							>
								{columns.map((col) => {
									if (col.key === 'timestamp') {
										return (
											<td key={col.key} style={{ width: `${colWidths[col.key]}px` }} className="py-1 px-4 whitespace-nowrap text-theme-text-muted text-[10px]">
												[{log.timestamp}]
											</td>
										);
									}
									if (col.key === 'tag') {
										return (
											<td key={col.key} style={{ width: `${colWidths[col.key]}px` }} className="py-1 px-4 whitespace-nowrap">
												<span className="text-[10px] text-theme-text-secondary">{log.tag}</span>
											</td>
										);
									}
									if (col.key === 'initiator') {
										return (
											<td key={col.key} style={{ width: `${colWidths[col.key]}px` }} className="py-1 px-4 whitespace-nowrap">
												<span className="text-[10px] text-theme-text-secondary truncate block" title={log.initiator}>
													{log.initiator}
												</span>
											</td>
										);
									}
									if (col.key === 'method') {
										return (
											<td key={col.key} style={{ width: `${colWidths[col.key]}px` }} className="py-1 px-4 whitespace-nowrap">
												{log.method !== '-' ? (
													<span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wide ${getMethodBadgeClass(log.method)}`}>
														{log.method}
													</span>
												) : (
													<span className="text-theme-text-muted text-[10px]">-</span>
												)}
											</td>
										);
									}
									if (col.key === 'status') {
										return (
											<td key={col.key} style={{ width: `${colWidths[col.key]}px` }} className="py-1 px-4 whitespace-nowrap">
												<span className={`inline-flex items-center gap-1 text-[10px] font-semibold ${log.isError ? 'text-red-400' : log.isSuccess ? 'text-emerald-400' : 'text-theme-text-secondary'}`}>
													<span>{log.statusText}</span>
												</span>
											</td>
										);
									}
									if (col.key === 'duration') {
										return (
											<td key={col.key} style={{ width: `${colWidths[col.key]}px` }} className="py-1 px-4 whitespace-nowrap font-mono text-[11px]">
												{log.durationMs !== null ? (
													<span className={log.durationMs < 100 ? 'text-emerald-400 font-semibold' : log.durationMs < 500 ? 'text-amber-400' : 'text-rose-400 font-bold'}>
														{log.durationText}
													</span>
												) : (
													<span className="text-theme-text-muted">-</span>
												)}
											</td>
										);
									}
									if (col.key === 'url') {
										return (
											<td key={col.key} style={{ width: `${colWidths[col.key]}px` }} className="py-1 px-4 font-mono text-theme-text-primary break-all whitespace-normal" title={log.url}>
												<span className={log.isError ? 'text-rose-300' : 'text-theme-text-primary'}>{log.url}</span>
												{log.cached && (
													<span className="ml-2 text-[9px] font-bold px-1.5 py-0.5 rounded border bg-indigo-500/15 text-indigo-300 border-indigo-500/30 uppercase tracking-wide inline-block">
														cached
													</span>
												)}
											</td>
										);
									}
									return (
										<td key={col.key} style={{ width: `${colWidths[col.key]}px` }} className="py-1 px-4 text-center">
											<div className="flex items-center justify-center gap-1">
												<button
													onClick={(e) => onCopy(log.raw.message + (log.raw.details ? '\n' + log.raw.details : ''), e)}
													className="p-1 text-theme-text-muted hover:text-theme-text-primary hover:bg-theme-panel rounded cursor-pointer transition-colors"
													title="Copy log entry"
												>
													<Icon icon="copy" className="h-3 w-3" />
												</button>
												{log.raw.details && (
													<button
														onClick={(e) => {
															e.stopPropagation();
															onToggleExpand(log.index);
														}}
														className="p-1 text-theme-text-muted hover:text-theme-accent hover:bg-theme-panel rounded cursor-pointer transition-colors"
														title={log.raw.expanded ? 'Hide Details' : 'Show Details'}
													>
														<Icon icon={log.raw.expanded ? 'chevron-down' : 'chevron-right'} className="h-3.5 w-3.5" />
													</button>
												)}
											</div>
										</td>
									);
								})}
							</tr>
							{log.raw.details && log.raw.expanded && (
								<tr key={`${log.index}-details`} className="bg-black/20 dark:bg-white/5 border-b border-theme-border">
									<td colSpan={8} className="p-3">
										<div className="text-theme-text-secondary text-[11px] font-mono whitespace-pre-wrap bg-theme-bg/80 p-3 rounded border border-theme-border/50 max-h-60 overflow-y-auto">
											{log.raw.details}
										</div>
									</td>
								</tr>
							)}
						</Fragment>
					))}
				</tbody>
			</table>
		</div>
	);
}

export default NetworkTable;