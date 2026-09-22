import { useState, useEffect } from 'react';
import { Icon } from './Icon';
import {
	generateCurlCommand,
	getDisplayResponseBody,
	getMethodBadgeClass,
	getPendingElapsedMs,
	getReqSizeColorClass,
	getResSizeColorClass,
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
	const [nowMs, setNowMs] = useState(() => typeof performance !== 'undefined' ? performance.now() : Date.now());
	const [activeTab, setActiveTab] = useState<'request' | 'response'>('request');

	useEffect(() => {
		let animId: number;
		function tick() {
			setNowMs(typeof performance !== 'undefined' ? performance.now() : Date.now());
			animId = requestAnimationFrame(tick);
		}
		animId = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(animId);
	}, []);

	const hasReq = selectedLog.requestBody !== undefined && selectedLog.requestBody !== null;
	const displayRes = getDisplayResponseBody(selectedLog);
	const hasRes = displayRes !== undefined && displayRes !== null;

	if (!selectedLog.isApiCall) {
		return (
			<>
				{/* CONSOLE LOG DETAIL VIEW */}
				<div className="flex items-center justify-between px-3 py-1.5 border-b border-theme-border/60 bg-theme-surface shrink-0">
					<div className="flex items-center gap-2">
						<span className={`text-pill leading-tight font-bold px-2 py-0.5 rounded border uppercase tracking-wide ${getStatusBadgeClass(selectedLog)}`}>
							{selectedLog.tag}
						</span>
						<span className="text-li-body leading-tight font-semibold text-theme-text-primary">Console Log Detail</span>
						<span className="text-pill leading-tight text-theme-text-secondary font-mono">[{selectedLog.timestamp}]</span>
					</div>
					<button
						onClick={onClose}
						className="text-theme-text-secondary hover:text-theme-text-primary p-0.5 rounded transition-colors cursor-pointer"
						title="Close panel"
					>
						<Icon icon="x" className="h-3.5 w-3.5" />
					</button>
				</div>

				<div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin p-4 space-y-4 font-mono text-li-body leading-tight">
					{/* Log Message Card */}
					<div className="bg-theme-bg border border-theme-border rounded-lg p-3 space-y-2">
						<div className="flex items-center justify-between text-pill leading-tight uppercase font-bold text-theme-text-secondary tracking-wider border-b border-theme-border/40 pb-1.5">
							<span className="flex items-center gap-1.5">
								<Icon icon="terminal" className="h-3.5 w-3.5 text-indigo-400" />
								Log Message
							</span>
							<button
								onClick={(e) => onCopy(selectedLog.message, e)}
								className="text-theme-text-secondary hover:text-theme-text-primary hover:bg-theme-surface rounded p-1 transition-colors flex items-center gap-1 normal-case font-normal cursor-pointer"
								title="Copy Message"
							>
								<Icon icon="copy" className="h-3 w-3" />
								<span>Copy</span>
							</button>
						</div>
						<div className="text-theme-text-primary text-li-body leading-tight font-mono leading-relaxed whitespace-pre-wrap break-words bg-theme-surface/50 p-2.5 rounded border border-theme-border/30">
							{selectedLog.message}
						</div>
					</div>

					{/* Log Details / Context / Stack Trace Card (if present) */}
					{selectedLog.raw.details && (
						<div className="bg-theme-bg border border-theme-border rounded-lg p-3 space-y-2">
							<div className="flex items-center justify-between text-pill leading-tight uppercase font-bold text-theme-text-secondary tracking-wider border-b border-theme-border/40 pb-1.5">
								<span className="flex items-center gap-1.5">
									<Icon icon="file-text" className="h-3.5 w-3.5 text-amber-500" />
									Context / Stack Trace
								</span>
								<button
									onClick={(e) => onCopy(selectedLog.raw.details || '', e)}
									className="text-theme-text-secondary hover:text-theme-text-primary hover:bg-theme-surface rounded p-1 transition-colors flex items-center gap-1 normal-case font-normal cursor-pointer"
									title="Copy Details"
								>
									<Icon icon="copy" className="h-3 w-3" />
									<span>Copy</span>
								</button>
							</div>
							<pre className="text-theme-text-secondary text-li-body leading-tight leading-relaxed whitespace-pre-wrap break-words bg-theme-surface/50 p-2.5 rounded border border-theme-border/30 max-h-60 overflow-y-auto">
								{selectedLog.raw.details}
							</pre>
						</div>
					)}

					{/* Metadata Summary */}
					<div className="bg-theme-bg border border-theme-border rounded-lg p-3 space-y-2">
						<div className="text-pill leading-tight uppercase font-bold text-theme-text-secondary tracking-wider border-b border-theme-border/40 pb-1.5 flex items-center gap-1.5">
							<Icon icon="info" className="h-3.5 w-3.5 text-sky-400" />
							Log Properties
						</div>
						<div className="grid grid-cols-2 gap-2 text-li-body leading-tight">
							<div className="bg-theme-surface/40 p-2 rounded border border-theme-border/20">
								<span className="text-pill leading-tight text-theme-text-secondary block">Timestamp</span>
								<span className="text-theme-text-primary font-semibold">{selectedLog.timestamp}</span>
							</div>
							<div className="bg-theme-surface/40 p-2 rounded border border-theme-border/20">
								<span className="text-pill leading-tight text-theme-text-secondary block">Tag / Level</span>
								<span className="text-theme-text-primary font-semibold">{selectedLog.tag}</span>
							</div>
							<div className="bg-theme-surface/40 p-2 rounded border border-theme-border/20">
								<span className="text-pill leading-tight text-theme-text-secondary block">Initiator</span>
								<span className="text-theme-text-primary font-semibold break-all">{selectedLog.initiator}</span>
							</div>
							<div className="bg-theme-surface/40 p-2 rounded border border-theme-border/20">
								<span className="text-pill leading-tight text-theme-text-secondary block">Status</span>
								<span className={`font-semibold ${selectedLog.isError ? 'text-rose-400' : selectedLog.isSuccess ? 'text-emerald-400' : 'text-theme-text-primary'}`}>{selectedLog.statusText}</span>
							</div>
						</div>
					</div>
				</div>
			</>
		);
	}

	// HTTP API CALL INSPECT PANEL
	function copyAll() {
		const reqBody = hasReq ? prettyJson(selectedLog.requestBody) : '';
		const resBody = hasRes ? (typeof displayRes === 'string' ? displayRes : prettyJson(displayRes)) : '';

		const parts: string[] = ['===== REQUEST ====='];
		parts.push(`${selectedLog.method} ${selectedLog.url}`);
		parts.push('Content-Type: application/json');
		parts.push(`Initiator: ${selectedLog.initiator}`);
		if (reqBody) parts.push(`\n${reqBody}`);

		parts.push(`\n===== RESPONSE =====`);
		parts.push(`Status: ${selectedLog.statusText}${selectedLog.cached ? ' (Cached)' : ''}`);
		if (selectedLog.durationMs !== null) parts.push(`Duration: ${selectedLog.durationText}`);
		if (resBody) parts.push(`\n${resBody}`);

		onCopy(parts.join('\n'));
	}

	function copyActiveTab() {
		if (activeTab === 'request') {
			if (hasReq) {
				onCopy(prettyJson(selectedLog.requestBody));
			} else {
				onCopy(`${selectedLog.method} ${selectedLog.url}\nInitiator: ${selectedLog.initiator}`);
			}
		} else {
			if (hasRes) {
				const resStr = typeof displayRes === 'string' ? displayRes : prettyJson(displayRes);
				onCopy(resStr);
			} else {
				onCopy(`Status: ${selectedLog.statusText}\nDuration: ${selectedLog.durationText}`);
			}
		}
	}

	return (
		<>
			{/* ROW 1: Method, URL, Status, Duration + Copy Both & cURL buttons */}
			<div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-theme-border/60 bg-theme-surface shrink-0">
				<div className="flex items-center gap-2 min-w-0 flex-1">
					<span className={`font-bold px-2 py-0.5 rounded border uppercase tracking-wide shrink-0 ${getMethodBadgeClass(selectedLog.method)}`} style={{ fontSize: '10px', lineHeight: '1.2' }}>
						{selectedLog.method}
					</span>
					<span className="font-mono text-theme-text-primary truncate flex-1" style={{ fontSize: '11px', lineHeight: '1.2' }} title={selectedLog.url}>{selectedLog.url}</span>
					{selectedLog.cached && (
						<span className="font-bold px-1.5 py-0.5 rounded border bg-indigo-500/15 text-indigo-400 border-indigo-500/30 uppercase tracking-wide shrink-0" style={{ fontSize: '10px', lineHeight: '1.2' }}>cached</span>
					)}
					{selectedLog.isPending ? (
						<span className="font-bold text-amber-500 uppercase tracking-wide shrink-0" style={{ fontSize: '10px', lineHeight: '1.2' }}>
							PENDING
						</span>
					) : (
						<span className={`font-semibold shrink-0 ${selectedLog.isError ? 'text-rose-400' : selectedLog.isSuccess ? 'text-emerald-400' : 'text-theme-text-secondary'}`} style={{ fontSize: '10px', lineHeight: '1.2' }}>
							{selectedLog.statusText}
						</span>
					)}
					<span className="text-theme-text-secondary shrink-0" style={{ fontSize: '10px', lineHeight: '1.2' }}>{selectedLog.durationText}</span>
				</div>

				<div className="flex items-center gap-1 shrink-0">
					<button
						onClick={() => onCopy(generateCurlCommand(selectedLog))}
						className="font-mono text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/15 rounded px-2 py-1 border border-indigo-500/30 flex items-center gap-1 cursor-pointer transition-colors"
						style={{ fontSize: '10px', lineHeight: '1.2' }}
						title="Copy request as cURL command"
					>
						<Icon icon="terminal" className="h-3 w-3" />
						<span>cURL</span>
					</button>
					<button
						onClick={copyAll}
						className="text-theme-text-secondary hover:text-theme-text-primary hover:bg-theme-panel rounded cursor-pointer p-1.5 transition-colors"
						title="Copy both request & response"
					>
						<Icon icon="copy" className="h-3.5 w-3.5" />
					</button>
					<button
						onClick={onClose}
						className="text-theme-text-secondary hover:text-theme-text-primary p-0.5 rounded transition-colors ml-1 cursor-pointer"
						title="Close panel"
					>
						<Icon icon="x" className="h-3.5 w-3.5" />
					</button>
				</div>
			</div>

			{/* ROW 2: REQUEST & RESPONSE Tabs + Size + Single Copy Icon for Active Tab */}
			<div className="flex items-center justify-between px-3 h-8 border-b border-theme-border/60 bg-theme-surface shrink-0">
				<div className="flex items-center h-full">
					<button
						onClick={() => setActiveTab('request')}
						className={`flex items-center gap-1.5 px-3 h-full border-b-2 transition-all cursor-pointer text-pill leading-tight font-semibold tracking-wide ${activeTab === 'request' ? 'border-emerald-400 text-theme-text-primary' : 'border-transparent text-theme-text-secondary hover:text-theme-text-secondary'}`}
					>
						<Icon icon="arrow-up-right" className="h-3 w-3 text-emerald-400" />
						Request
					</button>
					<button
						onClick={() => setActiveTab('response')}
						className={`flex items-center gap-1.5 px-3 h-full border-b-2 transition-all cursor-pointer text-pill leading-tight font-semibold tracking-wide ${activeTab === 'response' ? 'border-emerald-400 text-theme-text-primary' : 'border-transparent text-theme-text-secondary hover:text-theme-text-secondary'}`}
					>
						<Icon icon="arrow-down-left" className={`h-3 w-3 ${selectedLog.isPending ? 'text-amber-500' : 'text-emerald-400'}`} />
						Response
						{selectedLog.cached && (
							<span className="text-pill leading-tight font-bold px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-400 border border-indigo-500/40 lowercase">cached</span>
						)}
					</button>
				</div>

				<div className="flex items-center gap-2">
					<span className="text-pill leading-tight font-mono inline-flex items-center gap-1" title={`Request: ${selectedLog.reqSizeText} | Response: ${selectedLog.resSizeText}`}>
						<span className={getReqSizeColorClass(selectedLog.reqSizeBytes)}>{selectedLog.reqSizeText}</span>
						<span className="text-theme-text-secondary">/</span>
						<span className={getResSizeColorClass(selectedLog.resSizeBytes)}>{selectedLog.resSizeText}</span>
						{selectedLog.reqSizeBytes >= 50 * 1024 || selectedLog.resSizeBytes >= 50 * 1024 ? (
							<span title="Heavy payload (>50KB)">
								<Icon icon="alert-circle" className="h-3 w-3 text-rose-500 inline shrink-0" />
							</span>
						) : selectedLog.reqSizeBytes >= 10 * 1024 || selectedLog.resSizeBytes >= 10 * 1024 ? (
							<span title="Large payload (>10KB)">
								<Icon icon="alert-triangle" className="h-3 w-3 text-amber-500 inline shrink-0" />
							</span>
						) : null}
					</span>
					<button
						onClick={copyActiveTab}
						className="text-theme-text-secondary hover:text-theme-text-primary hover:bg-theme-panel rounded cursor-pointer p-1.5 transition-colors"
						title={`Copy active tab (${activeTab === 'request' ? 'Request' : 'Response'})`}
					>
						<Icon icon="copy" className="h-3.5 w-3.5" />
					</button>
				</div>
			</div>

			<div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin divide-y divide-theme-border/40">
				{activeTab === 'request' ? (
					/* Request Section */
					<div className="flex flex-col">
						<div className="px-3 py-2 border-b border-theme-border/20 space-y-1 bg-theme-surface/30">
							<div className="flex gap-2 items-baseline">
								<span className="text-theme-text-secondary shrink-0 w-24 font-mono" style={{ fontSize: '11px', lineHeight: '1.2' }}>Accept:</span>
								<span className="text-theme-text-secondary font-mono" style={{ fontSize: '11px', lineHeight: '1.2' }}>application/json</span>
							</div>
							<div className="flex gap-2 items-baseline">
								<span className="text-theme-text-secondary shrink-0 w-24 font-mono" style={{ fontSize: '11px', lineHeight: '1.2' }}>Content-Type:</span>
								<span className="text-theme-text-secondary font-mono" style={{ fontSize: '11px', lineHeight: '1.2' }}>application/json</span>
							</div>
							<div className="flex gap-2 items-baseline">
								<span className="text-theme-text-secondary shrink-0 w-24 font-mono" style={{ fontSize: '11px', lineHeight: '1.2' }}>Initiator:</span>
								<span className="text-theme-text-secondary break-all font-mono" style={{ fontSize: '11px', lineHeight: '1.2' }}>{selectedLog.initiator}</span>
							</div>
						</div>
						{hasReq ? (
							<div className="p-3 bg-theme-panel/30">
								<div className="uppercase font-bold text-theme-text-secondary tracking-wider pb-1 mb-1 border-b border-theme-border/20" style={{ fontSize: '10px', lineHeight: '1.2' }}>
									Request Body
								</div>
								<pre className="font-mono text-theme-text-primary whitespace-pre-wrap break-words" style={{ fontSize: '11px', lineHeight: '1.4' }}>{prettyJson(selectedLog.requestBody)}</pre>
							</div>
						) : (
							<div className="p-3 font-mono text-theme-text-secondary italic" style={{ fontSize: '11px', lineHeight: '1.2' }}>
								{selectedLog.method === 'GET' ? 'No request body (GET request).' : 'No request body captured.'}
							</div>
						)}
					</div>
				) : (
					/* Response Section */
					<div className="flex flex-col h-full">
						{selectedLog.isPending ? (
							<div className="flex-1 bg-theme-panel/20 text-center flex flex-col items-center justify-center gap-2.5 p-6 h-full min-h-[200px]">
								<div className="p-2.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-500">
									<Icon icon="loader" className="h-6 w-6 animate-spin" />
								</div>
								<div className="space-y-0.5">
									<div className="uppercase font-semibold text-amber-500" style={{ fontSize: '10px', lineHeight: '1.2' }}>Request Pending</div>
									<div className="font-mono text-theme-text-secondary" style={{ fontSize: '11px', lineHeight: '1.2' }}>
										Promise in-flight ({getPendingElapsedMs(selectedLog.raw, nowMs)}ms). <br/> Response body will populate once backend resolves.
									</div>
								</div>
							</div>
						) : hasRes ? (
							<div className="p-3 bg-theme-panel/30">
								{selectedLog.cached && (
									<div className="mb-2 px-2 py-1 bg-indigo-500/10 border border-indigo-500/20 rounded uppercase tracking-wide text-indigo-400 flex items-center gap-1.5" style={{ fontSize: '10px', lineHeight: '1.2' }}>
										<Icon icon="database" className="h-3 w-3 shrink-0" />
										<span>Served from SSR Cache</span>
									</div>
								)}
								<pre className="font-mono text-theme-text-primary whitespace-pre-wrap break-words" style={{ fontSize: '11px', lineHeight: '1.4' }}>{typeof displayRes === 'string' ? displayRes : prettyJson(displayRes)}</pre>
							</div>
						) : (
							<div className="p-4 font-mono text-theme-text-secondary italic" style={{ fontSize: '11px', lineHeight: '1.2' }}>
								No response body captured.
							</div>
						)}
					</div>
				)}
			</div>
		</>
	);
}

export default RequestResponsePanel;
