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
	pending?: boolean;
	isUpdate?: boolean;
}

export interface LogStreamOptions {
	/** Full URL of the SSE endpoint (defaults to `{basePath}/stream`). */
	url?: string;
}

function formatLog(log: ServerApiLogEvent) {
	const isConsole = log.method === '-';
	const elapsed = log.duration_ms !== null && log.duration_ms !== undefined ? `${log.duration_ms}ms` : '';
	
	const meta = {
		id: String(log.id),
		tag: isConsole ? 'server console' : (log.cached ? 'server cache' : (log.url.startsWith('http') ? 'server fetch' : 'server api')),
		method: log.method,
		url: log.url,
		status: log.status || undefined,
		duration_ms: log.duration_ms || undefined,
		initiator: log.initiator,
		request_body: log.request_body,
		response_body: log.response_body,
		cached: log.cached,
		pending: log.pending,
		startTime: log.pending ? Date.now() : undefined
	};

	if (isConsole) {
		terminalStore.addLog(log.url, log.success ? 'info' : 'error', log.details, meta);
		return;
	}

	const tail = [log.status !== null ? `HTTP ${log.status}` : '', elapsed].filter(Boolean).join(' · ');
	let message = '';
	let type: 'success' | 'error' | 'info' = 'info';
	let details = log.details;

	if (log.pending) {
		message = `[API] ${log.method} ${log.url} — pending...`;
		type = 'info';
	} else if (log.success) {
		message = `[API] ${log.method} ${log.url} — success${tail ? ` (${tail})` : ''}`;
		type = 'success';
	} else {
		message = `[API] ${log.method} ${log.url} — failed${tail ? ` (${tail})` : ''}`;
		details = [log.error ? `Error: ${log.error}` : '', log.status !== null ? `HTTP ${log.status}` : '', log.duration_ms !== null ? `Elapsed: ${log.duration_ms}ms` : '']
			.filter(Boolean)
			.join('\n') || log.details;
		type = 'error';
	}

	if (log.isUpdate) {
		terminalStore.updateLog(String(log.id), () => ({
			message,
			type,
			details,
			...meta
		}));
	} else {
		// Pass log.id down via meta if needed, but the client store auto-generates one.
		// To link server updates, we need the store to use the SERVER's ID.
		// Wait, addLog currently ignores the ID! We must ensure it uses the server ID!
		terminalStore.addLog(message, type, details, meta);
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