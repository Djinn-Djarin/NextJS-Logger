import { Icon } from './Icon';
import {
	getDisplayResponseBody,
	getMethodBadgeClass,
	getStatusBadgeClass,
	prettyJson,
	type ParsedLog
} from './logUtils';

export interface RequestResponsePanelProps {
	log: ParsedLog;
	onClose: () => void;
	onCopy: (text: string, e?: React.MouseEvent) => void;
}

export function RequestResponsePanel({ log: selectedLog, onClose, onCopy }: RequestResponsePanelProps) {
	const hasReq = selectedLog.requestBody !== undefined && selectedLog.requestBody !== null;
	const displayRes = getDisplayResponseBody(selectedLog);
	const hasRes = displayRes !== undefined && displayRes !== null;

	if (!selectedLog.isApiCall) {
		return (
			<>
				{/* CONSOLE LOG DETAIL VIEW */}
				<div className="flex items-center justify-between px-3 py-1.5 border-b border-theme-border/60 bg-theme-surface shrink-0">
					<div className="flex items-center gap-2">
						<span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wide ${getStatusBadgeClass(selectedLog)}`}>
							{selectedLog.tag}
						</span>
						<span className="text-[11px] font-semibold text-theme-text-primary">Console Log Detail</span>
						<span className="text-[10px] text-theme-text-muted font-mono">[{selectedLog.timestamp}]</span>
					</div>
					<button
						onClick={onClose}
						className="text-theme-text-muted hover:text-theme-text-primary p-0.5 rounded transition-colors cursor-pointer"
						title="Close panel"
					>
						<Icon icon="x" className="h-3.5 w-3.5" />
					</button>
				</div>

				<div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin p-4 space-y-4 font-mono text-[11px]">
					{/* Log Message Card */}
					<div className="bg-theme-bg border border-theme-border rounded-lg p-3 space-y-2">
						<div className="flex items-center justify-between text-[10px] uppercase font-bold text-theme-text-muted tracking-wider border-b border-theme-border/40 pb-1.5">
							<span className="flex items-center gap-1.5">
								<Icon icon="terminal" className="h-3.5 w-3.5 text-indigo-400" />
								Log Message
							</span>
							<button
								onClick={(e) => onCopy(selectedLog.message, e)}
								className="text-theme-text-muted hover:text-theme-text-primary hover:bg-theme-surface rounded p-1 transition-colors flex items-center gap-1 normal-case font-normal cursor-pointer"
								title="Copy Message"
							>
								<Icon icon="copy" className="h-3 w-3" />
								<span>Copy</span>
							</button>
						</div>
						<div className="text-theme-text-primary text-[12px] font-mono leading-relaxed whitespace-pre-wrap break-words bg-theme-surface/50 p-2.5 rounded border border-theme-border/30">
							{selectedLog.message}
						</div>
					</div>

					{/* Log Details / Context / Stack Trace Card (if present) */}
					{selectedLog.raw.details && (
						<div className="bg-theme-bg border border-theme-border rounded-lg p-3 space-y-2">
							<div className="flex items-center justify-between text-[10px] uppercase font-bold text-theme-text-muted tracking-wider border-b border-theme-border/40 pb-1.5">
								<span className="flex items-center gap-1.5">
									<Icon icon="file-text" className="h-3.5 w-3.5 text-amber-400" />
									Context / Stack Trace
								</span>
								<button
									onClick={(e) => onCopy(selectedLog.raw.details || '', e)}
									className="text-theme-text-muted hover:text-theme-text-primary hover:bg-theme-surface rounded p-1 transition-colors flex items-center gap-1 normal-case font-normal cursor-pointer"
									title="Copy Details"
								>
									<Icon icon="copy" className="h-3 w-3" />
									<span>Copy</span>
								</button>
							</div>
							<pre className="text-theme-text-secondary text-[11px] leading-relaxed whitespace-pre-wrap break-words bg-theme-surface/50 p-2.5 rounded border border-theme-border/30 max-h-60 overflow-y-auto">
								{selectedLog.raw.details}
							</pre>
						</div>
					)}

					{/* Metadata Summary */}
					<div className="bg-theme-bg border border-theme-border rounded-lg p-3 space-y-2">
						<div className="text-[10px] uppercase font-bold text-theme-text-muted tracking-wider border-b border-theme-border/40 pb-1.5 flex items-center gap-1.5">
							<Icon icon="info" className="h-3.5 w-3.5 text-sky-400" />
							Log Properties
						</div>
						<div className="grid grid-cols-2 gap-2 text-[11px]">
							<div className="bg-theme-surface/40 p-2 rounded border border-theme-border/20">
								<span className="text-[10px] text-theme-text-muted block">Timestamp</span>
								<span className="text-theme-text-primary font-semibold">{selectedLog.timestamp}</span>
							</div>
							<div className="bg-theme-surface/40 p-2 rounded border border-theme-border/20">
								<span className="text-[10px] text-theme-text-muted block">Tag / Level</span>
								<span className="text-theme-text-primary font-semibold">{selectedLog.tag}</span>
							</div>
							<div className="bg-theme-surface/40 p-2 rounded border border-theme-border/20">
								<span className="text-[10px] text-theme-text-muted block">Initiator</span>
								<span className="text-theme-text-primary font-semibold">{selectedLog.initiator}</span>
							</div>
							<div className="bg-theme-surface/40 p-2 rounded border border-theme-border/20">
								<span className="text-[10px] text-theme-text-muted block">Status</span>
								<span className={`font-semibold ${selectedLog.isError ? 'text-red-400' : selectedLog.isSuccess ? 'text-emerald-400' : 'text-theme-text-primary'}`}>
									{selectedLog.statusText}
								</span>
							</div>
						</div>
					</div>
				</div>
			</>
		);
	}

	// HTTP API CALL INSPECT PANEL
	return (
		<>
			<div className="flex items-center gap-2 px-3 py-1.5 border-b border-theme-border/60 bg-theme-surface shrink-0">
				<span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wide ${getMethodBadgeClass(selectedLog.method)}`}>
					{selectedLog.method}
				</span>
				<span className="font-mono text-[11px] text-theme-text-primary truncate flex-1" title={selectedLog.url}>
					{selectedLog.url}
				</span>
				{selectedLog.cached && (
					<span className="text-[9px] font-bold px-1.5 py-0.5 rounded border bg-indigo-500/15 text-indigo-300 border-indigo-500/30 uppercase tracking-wide shrink-0">
						cached
					</span>
				)}
				<span className={`text-[10px] font-semibold ${selectedLog.isError ? 'text-red-400' : selectedLog.isSuccess ? 'text-emerald-400' : 'text-theme-text-secondary'}`}>
					{selectedLog.statusText}
				</span>
				<span className="text-[10px] text-theme-text-muted">{selectedLog.durationText}</span>
				<span className="text-[10px] text-theme-text-muted truncate max-w-[130px]" title={selectedLog.initiator}>
					{selectedLog.initiator}
				</span>
				<div className="flex items-center gap-1 ml-2 shrink-0">
					<button
						onClick={(e) => {
							const toCopy = [
								`${selectedLog.method} ${selectedLog.url}`,
								`Status: ${selectedLog.statusText} (${selectedLog.durationText})`,
								`Initiator: ${selectedLog.initiator || 'unknown'}`,
								selectedLog.cached ? 'Cached: true' : null,
								'',
								'--- REQUEST ---',
								hasReq ? (typeof selectedLog.requestBody === 'string' ? selectedLog.requestBody : JSON.stringify(selectedLog.requestBody, null, 2)) : '(none)',
								'',
								'--- RESPONSE ---',
								hasRes ? (typeof displayRes === 'string' ? displayRes : JSON.stringify(displayRes, null, 2)) : '(none)'
							].filter(x => x !== null).join('\n');
							onCopy(toCopy, e);
						}}
						className="text-theme-text-muted hover:text-theme-text-primary p-0.5 rounded transition-colors cursor-pointer"
						title="Copy request and response"
					>
						<Icon icon="copy" className="h-3.5 w-3.5" />
					</button>
					<button
						onClick={onClose}
						className="text-theme-text-muted hover:text-theme-text-primary p-0.5 rounded transition-colors cursor-pointer"
						title="Close panel"
					>
						<Icon icon="x" className="h-3.5 w-3.5" />
					</button>
				</div>
			</div>

			<div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin divide-y divide-theme-border/40">
				{/* Request Section */}
				<div className="flex flex-col">
					<div className="sticky top-0 z-10 flex items-center justify-between px-3 py-1.5 border-b border-theme-border/40 bg-theme-surface text-[10px] uppercase tracking-wide text-theme-text-muted shrink-0">
						<span className="flex items-center gap-1.5">
							<Icon icon="arrow-up-right" className="h-3 w-3 text-emerald-400" />
							Request
						</span>
						{hasReq && (
							<button
								onClick={() => onCopy(prettyJson(selectedLog.requestBody))}
								className="text-theme-text-muted hover:text-theme-text-primary hover:bg-theme-panel rounded cursor-pointer p-0.5 transition-colors"
								title="Copy request body"
							>
								<Icon icon="copy" className="h-3 w-3" />
							</button>
						)}
					</div>
					<div className="px-3 py-2 text-[11px] font-mono text-theme-text-secondary border-b border-theme-border/20 space-y-1">
						<div className="flex gap-2">
							<span className="text-theme-text-muted shrink-0">URL:</span>
							<span className="text-theme-text-primary break-all">
								{selectedLog.method} {selectedLog.url}
							</span>
						</div>
						<div className="flex gap-2">
							<span className="text-theme-text-muted shrink-0">Content-Type:</span>
							<span>application/json</span>
						</div>
						<div className="flex gap-2">
							<span className="text-theme-text-muted shrink-0">Initiator:</span>
							<span className="break-all">{selectedLog.initiator}</span>
						</div>
						{!hasReq && (
							<div className="flex gap-2 text-theme-text-muted italic text-[10px] pt-1">
								<span className="shrink-0">Body:</span>
								<span>{selectedLog.method === 'GET' ? 'No request body (GET request).' : 'No request body captured.'}</span>
							</div>
						)}
					</div>
					{hasReq && (
						<div className="max-h-52 overflow-auto scrollbar-thin p-3 bg-theme-panel/30">
							<pre className="font-mono text-[11px] leading-relaxed text-theme-text-primary whitespace-pre-wrap break-words">
								{prettyJson(selectedLog.requestBody)}
							</pre>
						</div>
					)}
				</div>

				{/* Response Section */}
				<div className="flex flex-col">
					<div className="sticky top-0 z-10 flex items-center justify-between px-3 py-1.5 border-b border-theme-border/40 bg-theme-surface text-[10px] uppercase tracking-wide text-theme-text-muted shrink-0">
						<span className="flex items-center gap-1.5">
							<Icon icon="arrow-down-left" className="h-3 w-3 text-emerald-400" />
							Response
							{selectedLog.cached && (
								<span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 lowercase">
									cached response
								</span>
							)}
						</span>
						{hasRes && (
							<button
								onClick={() => onCopy(prettyJson(displayRes))}
								className="text-theme-text-muted hover:text-theme-text-primary hover:bg-theme-panel rounded cursor-pointer p-0.5 transition-colors"
								title="Copy response body"
							>
								<Icon icon="copy" className="h-3 w-3" />
							</button>
						)}
					</div>
					<div className="px-3 py-2 text-[11px] font-mono text-theme-text-secondary border-b border-theme-border/20 space-y-1">
						<div className="flex gap-2">
							<span className="text-theme-text-muted shrink-0">Status:</span>
							<span className={selectedLog.isError ? 'text-red-400' : selectedLog.isSuccess ? 'text-emerald-400' : 'text-theme-text-primary'}>
								{selectedLog.statusText} {selectedLog.cached ? '(Cached)' : ''}
							</span>
						</div>
						<div className="flex gap-2">
							<span className="text-theme-text-muted shrink-0">Duration:</span>
							<span>{selectedLog.durationText}</span>
						</div>
						<div className="flex gap-2">
							<span className="text-theme-text-muted shrink-0">Tag:</span>
							<span>{selectedLog.tag}</span>
						</div>
						{!hasRes && (
							<div className="flex gap-2 text-theme-text-muted italic text-[10px] pt-1">
								<span className="shrink-0">Body:</span>
								<span>No response body captured.</span>
							</div>
						)}
					</div>
					{hasRes && (
						<div className="p-3 bg-theme-panel/30">
							{selectedLog.cached && (
								<div className="mb-2 px-2 py-1 bg-indigo-500/10 border border-indigo-500/20 rounded text-[10px] text-indigo-300 flex items-center gap-1.5">
									<Icon icon="database" className="h-3 w-3 shrink-0" />
									<span>Served from SSR Cache</span>
								</div>
							)}
							<pre className="font-mono text-[11px] leading-relaxed text-theme-text-primary whitespace-pre-wrap break-words">
								{typeof displayRes === 'string' ? displayRes : prettyJson(displayRes)}
							</pre>
						</div>
					)}
				</div>
			</div>
		</>
	);
}

export default RequestResponsePanel;