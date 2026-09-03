import type { LogEntry } from '../client/store';
import { sanitizeUrl } from '../utils';

export type SortKey = 'timestamp' | 'tag' | 'initiator' | 'method' | 'url' | 'status' | 'duration' | 'size';
export type SortDir = 'asc' | 'desc';

export interface LogColumn {
	key: SortKey | 'action';
	label: string;
	sortable: boolean;
	grow?: boolean;
}

export const columns: LogColumn[] = [
	{ key: 'timestamp', label: 'Time', sortable: true },
	{ key: 'method', label: 'Method', sortable: true },
	{ key: 'url', label: 'URL / Endpoint', sortable: true, grow: true },
	{ key: 'status', label: 'Status', sortable: true },
	{ key: 'duration', label: 'Time', sortable: true },
	{ key: 'size', label: 'Size', sortable: true },
	{ key: 'initiator', label: 'Initiator', sortable: true },
	{ key: 'tag', label: 'Tag', sortable: true },
	{ key: 'action', label: 'Action', sortable: false }
];

export const DEFAULT_COL_WIDTHS: Record<string, number> = {
	timestamp: 110,
	method: 72,
	url: 320,
	status: 84,
	duration: 84,
	size: 100,
	initiator: 160,
	tag: 84,
	action: 64
};

export const COMPACT_COL_WIDTHS: Record<string, number> = {
	timestamp: 80,
	method: 58,
	url: 160,
	status: 64,
	duration: 64,
	size: 80,
	initiator: 100,
	tag: 64,
	action: 52
};

export interface ParsedLog {
	raw: LogEntry;
	index: number;
	timestamp: string;
	tag: string;
	method: string;
	url: string;
	statusText: string;
	statusCode: number | null;
	isSuccess: boolean;
	isError: boolean;
	isPending: boolean;
	isApiCall: boolean;
	durationMs: number | null;
	durationText: string;
	initiator: string;
	message: string;
	requestBody?: unknown;
	responseBody?: unknown;
	reqSizeBytes: number;
	reqSizeText: string;
	resSizeBytes: number;
	resSizeText: string;
	cached: boolean;
}

export function computeSize(body: unknown): { bytes: number; formatted: string } {
	if (body === undefined || body === null) return { bytes: 0, formatted: '0 B' };
	let str = '';
	if (typeof body === 'string') {
		str = body;
	} else {
		try {
			str = JSON.stringify(body);
		} catch {
			str = String(body);
		}
	}
	const bytes = new TextEncoder().encode(str).length;
	if (bytes === 0) return { bytes: 0, formatted: '0 B' };
	if (bytes < 1024) return { bytes, formatted: `${bytes} B` };
	if (bytes < 1024 * 1024) return { bytes, formatted: `${(bytes / 1024).toFixed(1)} KB` };
	return { bytes, formatted: `${(bytes / (1024 * 1024)).toFixed(1)} MB` };
}

export function normalizeTag(raw: string | undefined, cached: boolean): string {
	const t = (raw || '').toUpperCase();
	if (t === 'API') return cached ? 'server cache' : 'client';
	if (t === 'API CLIENT') return 'client';
	if (t === 'SERVER LOG') return 'server log';
	if (t === 'SERVER CACHE') return 'server cache';
	if (t === 'CLIENT CACHE') return 'client cache';
	if (t === 'RENDER LOOP') return 'render loop';
	return 'client log';
}

export function parseLogEntry(log: LogEntry, index: number): ParsedLog {
	let tag = log.tag || '';
	let method = log.method || '';
	let url = log.url || '';
	let statusCode: number | null = typeof log.status === 'number' ? log.status : null;
	let statusText = log.status !== undefined && log.status !== null ? String(log.status) : '';
	let durationMs: number | null = log.duration_ms ?? null;
	let message = log.message;

	if (!tag || !method || !url) {
		const apiMatch = message.match(/^\[([^\]]+)\]\s+([A-Z]{3,7})\s+([^\s—]+)(?:\s+—\s+([^(]+)(?:\s+\(([^)]+)\))?)?/);
		if (apiMatch) {
			tag = tag || apiMatch[1];
			method = method || apiMatch[2];
			url = url || apiMatch[3];
			const statusPart = (apiMatch[4] || '').trim();
			const parenPart = apiMatch[5] || '';

			if (parenPart) {
				const httpMatch = parenPart.match(/HTTP\s+(\d+)/i);
				if (httpMatch) {
					statusCode = parseInt(httpMatch[1], 10);
				}
				const msMatch = parenPart.match(/(\d+(?:\.\d+)?)\s*ms/i);
				if (msMatch) {
					durationMs = parseFloat(msMatch[1]);
				}
			}

			if (!statusText) {
				if (statusCode !== null) {
					statusText = `HTTP ${statusCode}`;
				} else {
					statusText = statusPart || (log.type === 'error' ? 'failed' : 'success');
				}
			}
		} else {
			const tagMatch = message.match(/^\[([^\]]+)\]\s*(.*)/);
			if (tagMatch) {
				tag = tag || tagMatch[1];
				url = tagMatch[2];
			} else {
				tag = tag || log.type.toUpperCase();
				url = message;
			}
		}
	}

	let initiator = log.initiator || '';
	if (!initiator) {
		if (log.details && log.details.includes('Location:')) {
			const locMatch = log.details.match(/Location:\s*([^\n]+)/);
			if (locMatch) {
				const parts = locMatch[1].split(/[\/\\]/);
				initiator = parts[parts.length - 1] || locMatch[1];
			}
		}
		if (!initiator) {
			if ((tag || '').toUpperCase() === 'API') {
				initiator = 'Server Stream';
			} else if ((tag || '').toUpperCase().includes('CONSOLE')) {
				initiator = 'Console';
			} else if (log.type === 'user') {
				initiator = 'User Input';
			} else {
				initiator = 'Client';
			}
		}
	}

	const isPending = Boolean((log as any).pending) || log.status === 'Pending' || statusText.toLowerCase().includes('pending');
	const isError = !isPending && (log.type === 'error' || (statusCode !== null && statusCode >= 400) || statusText.toLowerCase().includes('fail'));
	const isSuccess = !isPending && (log.type === 'success' || (statusCode !== null && statusCode >= 200 && statusCode < 300) || statusText.toLowerCase().includes('success'));
	const isApiCall = (tag || '').toUpperCase() === 'API' || (method !== '' && method !== '-');
	const isCached = Boolean(log.cached) || (isApiCall && (durationMs === 0 || Boolean(log.details && log.details.includes('served from cache'))));
	const durationText = isPending ? 'Pending...' : (durationMs !== null ? `${durationMs}ms` : '-');

	let finalStatusText = isPending ? 'PENDING' : statusText;
	if (!isApiCall && !isPending) {
		if (!finalStatusText || finalStatusText.startsWith('HTTP')) {
			finalStatusText = isError ? 'Error' : isSuccess ? 'Success' : 'Info';
		}
	} else if (!finalStatusText && !isPending) {
		finalStatusText = statusCode !== null ? `HTTP ${statusCode}` : (isError ? 'Failed' : 'HTTP 200');
	}

	const reqSize = computeSize(log.request_body);
	const displayRes = getDisplayResponseBodyFromLog(log.response_body, log.details, isCached, url, log.timestamp);
	const resSize = computeSize(displayRes);

	return {
		raw: log,
		index,
		timestamp: log.timestamp,
		tag: normalizeTag(tag || log.type, !!log.cached),
		method: (method || '-').toUpperCase(),
		url: sanitizeUrl(url || log.url || message),
		statusText: finalStatusText,
		statusCode,
		isSuccess,
		isError,
		isPending,
		isApiCall,
		durationMs,
		durationText,
		initiator,
		message: sanitizeUrl(message),
		requestBody: log.request_body,
		responseBody: log.response_body,
		reqSizeBytes: reqSize.bytes,
		reqSizeText: reqSize.formatted,
		resSizeBytes: resSize.bytes,
		resSizeText: resSize.formatted,
		cached: isCached
	};
}

function getDisplayResponseBodyFromLog(responseBody: unknown, details?: string, cached?: boolean, url?: string, timestamp?: string): unknown {
	if (responseBody !== undefined && responseBody !== null) {
		const isObj = typeof responseBody === 'object' && responseBody !== null;
		if (isObj && Object.keys(responseBody as object).length === 0 && details) {
			return details;
		}
		return responseBody;
	}
	if (details) {
		return details;
	}
	if (cached) {
		return {
			success: true,
			http_code: 200,
			message: 'Response served from SSR Cache.',
			data: { cached: true, url, timestamp }
		};
	}
	return undefined;
}

export const comparators: Record<SortKey, (a: ParsedLog, b: ParsedLog) => number> = {
	timestamp: (a, b) => a.index - b.index,
	tag: (a, b) => a.tag.localeCompare(b.tag),
	initiator: (a, b) => a.initiator.localeCompare(b.initiator),
	method: (a, b) => a.method.localeCompare(b.method),
	url: (a, b) => a.url.localeCompare(b.url),
	status: (a, b) => (a.statusCode ?? 0) - (b.statusCode ?? 0) || a.statusText.localeCompare(b.statusText),
	duration: (a, b) => (a.durationMs ?? -1) - (b.durationMs ?? -1),
	size: (a, b) => (a.resSizeBytes + a.reqSizeBytes) - (b.resSizeBytes + b.reqSizeBytes)
};

export function getReqSizeColorClass(bytes: number): string {
	if (bytes >= 50 * 1024) return 'text-rose-400 font-bold';
	if (bytes >= 10 * 1024) return 'text-amber-400 font-semibold';
	return 'text-sky-300 font-medium';
}

export function getResSizeColorClass(bytes: number): string {
	if (bytes >= 50 * 1024) return 'text-rose-400 font-bold';
	if (bytes >= 10 * 1024) return 'text-amber-400 font-semibold';
	return 'text-emerald-400 font-medium';
}

export function getMethodBadgeClass(method: string) {
	switch (method) {
		case 'GET': return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
		case 'POST': return 'bg-blue-500/15 text-blue-400 border-blue-500/30';
		case 'PUT': return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
		case 'DELETE': return 'bg-rose-500/15 text-rose-400 border-rose-500/30';
		case 'PATCH': return 'bg-purple-500/15 text-purple-400 border-purple-500/30';
		default: return 'bg-slate-500/15 text-slate-400 border-slate-500/30';
	}
}

export function getStatusBadgeClass(log: ParsedLog) {
	if (log.isPending) return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
	if (log.isError) return 'bg-rose-500/15 text-rose-400 border-rose-500/30';
	if (log.isSuccess) return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
	return 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30';
}

export function getPendingElapsedMs(log: LogEntry, currentNowMs?: number): number {
	if (!(log as any).startTime) return 0;
	const now = currentNowMs !== undefined ? currentNowMs : (typeof performance !== 'undefined' ? performance.now() : Date.now());
	const start = (log as any).startTime;
	if (start > 1e11) {
		return Math.max(0, Math.round(Date.now() - start));
	}
	return Math.max(0, Math.round(now - start));
}

export function prettyJson(body: unknown): string {
	if (body === undefined || body === null) return '';
	if (typeof body === 'string') {
		try {
			return JSON.stringify(JSON.parse(body), null, 2);
		} catch {
			return body;
		}
	}
	try {
		return JSON.stringify(body, null, 2);
	} catch {
		return String(body);
	}
}

export function getDisplayResponseBody(log: ParsedLog): unknown {
	if (log.responseBody !== undefined && log.responseBody !== null) {
		const isObj = typeof log.responseBody === 'object' && log.responseBody !== null;
		if (isObj && Object.keys(log.responseBody as object).length === 0 && log.raw.details) {
			return log.raw.details;
		}
		return log.responseBody;
	}
	if (log.raw.details) {
		return log.raw.details;
	}
	if (log.cached) {
		return {
			success: true,
			http_code: 200,
			message: 'Response served from SSR Cache.',
			data: {
				cached: true,
				url: log.url,
				timestamp: log.timestamp
			}
		};
	}
	return undefined;
}

export function generateCurlCommand(log: ParsedLog): string {
	const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
	const fullUrl = log.url.startsWith('http') ? log.url : `${origin}${log.url.startsWith('/') ? '' : '/'}${log.url}`;
	const hasBody = log.requestBody !== undefined && log.requestBody !== null && log.method !== 'GET' && log.method !== 'HEAD';

	let curl = `curl -X ${log.method} "${fullUrl}"`;
	curl += ` \\\n  -H "Accept: application/json"`;

	if (hasBody) {
		curl += ` \\\n  -H "Content-Type: application/json"`;
		curl += ` \\\n  -d '${JSON.stringify(log.requestBody)}'`;
	}

	return curl;
}
