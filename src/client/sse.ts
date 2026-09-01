import { terminalStore } from './store';
import { clientConfig, getEffectiveBasePath } from './config';

export interface ServerApiLogEvent {
	id: number;
	timestamp: string;
	method: string;
	url: string;
	success: boolean;
	status: number | null;
	duration_ms: number | null;
	error?: string;
	details?: string;
	initiator?: string;
	request_body?: unknown;
	response_body?: unknown;
	cached?: boolean;
}

export interface LogStreamOptions {
	/** Full URL of the SSE endpoint (defaults to `{basePath}/stream`). */
	url?: string;
}

function formatLog(log: ServerApiLogEvent) {
	const elapsed = log.duration_ms !== null && log.duration_ms !== undefined ? `${log.duration_ms}ms` : '';
	const tail = [log.status !== null ? `HTTP ${log.status}` : '', elapsed].filter(Boolean).join(' · ');
	const meta = {
		tag: log.cached ? 'server cache' : 'api client',
		method: log.method,
		url: log.url,
		status: log.status ?? (log.success ? 200 : 500),
		duration_ms: log.duration_ms ?? undefined,
		initiator: log.initiator || 'Server',
		request_body: log.request_body,
		response_body: log.response_body,
		cached: log.cached
	};

	if (log.success) {
		const message = `[API] ${log.method} ${log.url} — success${tail ? ` (${tail})` : ''}`;
		terminalStore.addLog(message, 'success', log.details, meta);
	} else {
		const message = `[API] ${log.method} ${log.url} — failed${tail ? ` (${tail})` : ''}`;
		const details = [log.error ? `Error: ${log.error}` : '', log.status !== null ? `HTTP ${log.status}` : '', log.duration_ms !== null ? `Elapsed: ${log.duration_ms}ms` : '']
			.filter(Boolean)
			.join('\n');
		terminalStore.addLog(message, 'error', details || log.details, meta);
	}
}

let sse: EventSource | null = null;

/**
 * Subscribe to the server-side log stream and mirror entries into the client
 * store. Returns a cleanup function. Re-entrant (won't open a second stream).
 */
export function startLogStream(options: LogStreamOptions = {}): () => void {
	if (typeof window === 'undefined') return () => {};
	if (sse) return () => close();

	sse = new EventSource(options.url ?? `${getEffectiveBasePath()}/stream`);
	sse.addEventListener('api-log', (evt) => {
		try {
			const log = JSON.parse((evt as MessageEvent).data) as ServerApiLogEvent;
			formatLog(log);
		} catch {
			/* ignore malformed events */
		}
	});

	const close = () => {
		try {
			sse?.close();
		} catch {
			/* ignore */
		}
		sse = null;
	};
	return close;
}

/** Close the active SSE stream (if any). */
export function stopLogStream() {
	if (sse) {
		try {
			sse.close();
		} catch {
			/* ignore */
		}
		sse = null;
	}
}