import { AsyncLocalStorage } from 'async_hooks';

/** A single captured request/fetch log entry. */
export interface ServerLogEntry {
	id: number;
	timestamp: string; // ISO timestamp
	method: string;
	url: string;
	success: boolean;
	status: number | null;
	duration_ms: number | null;
	error?: string;
	details?: string;
	/** Which file:line / function initiated the call. */
	initiator?: string;
	/** True when the response was served from a cache (0ms). */
	cached?: boolean;
	/** Parsed request body (JSON) sent to the target. */
	request_body?: unknown;
	/** Parsed response body (JSON) returned by the target. */
	response_body?: unknown;
}

/** Max serialized size (chars) for request/response bodies kept in a log entry. */
export const MAX_BODY_CHARS = 100_000;

/** Truncate a body so oversized payloads don't bloat memory/SSE. */
export function capBody(body: unknown, maxChars = MAX_BODY_CHARS): unknown {
	if (body === undefined || body === null) return body;
	if (typeof body === 'string') return body.length > maxChars ? body.slice(0, maxChars) + '\n… [truncated]' : body;
	try {
		const str = JSON.stringify(body);
		if (str.length <= maxChars) return body;
		return str.slice(0, maxChars) + '\n… [truncated]';
	} catch {
		return String(body);
	}
}

export const MAX_LOGS = 500;

const BURST_WINDOW_MS = 1000;
const BURST_THRESHOLD = 30;

export interface LogStoreState {
	logs: ServerLogEntry[];
	seq: number;
	listeners: Set<(log: ServerLogEntry) => void>;
	burstTimestamps: number[];
	burstWarnedAt: number;
	emittingBurstWarning: boolean;
}

const GLOBAL_KEY = '__nextLogInspectorStore__';

/**
 * Next.js bundles `instrumentation.ts` and route handlers separately, so a plain
 * module-level array would give each bundle its own private copy. Everything
 * lives on `globalThis` instead — both bundles run in the same Node process, so
 * they share one store and the SSE handler sees what the instrumentation pushed.
 */
export function getStoreState(): LogStoreState {
	const g = globalThis as Record<string, unknown>;
	let state = g[GLOBAL_KEY] as LogStoreState | undefined;
	if (!state) {
		state = {
			logs: [],
			seq: 0,
			listeners: new Set(),
			burstTimestamps: [],
			burstWarnedAt: 0,
			emittingBurstWarning: false
		};
		g[GLOBAL_KEY] = state;
	}
	return state;
}

/** AsyncLocalStorage carrying the initiating file/function (X-Initiator header). */
const initiatorAls = new AsyncLocalStorage<string>();

export function runWithInitiator(initiator: string | null | undefined, fn: () => unknown): unknown {
	return initiatorAls.run(initiator || '', fn);
}

export function getRequestInitiator(): string {
	return initiatorAls.getStore() || '';
}

/**
 * Best-effort name of the calling server module/function, e.g. `engine.call (engine.ts:45)`.
 * Walks the stack, skipping internal frames.
 */
export function captureServerInitiator(): string {
	try {
		const stack = new Error().stack || '';
		for (const line of stack.split('\n').slice(1)) {
			const raw = line.trim().replace(/^at\s+/, '');
			if (!raw) continue;
			const paren = raw.match(/\(([^)]+)\)/);
			const loc = paren ? paren[1] : raw;
			const clean = loc.replace(/^file:\/\//, '');
			const m = clean.match(/([^/:]+):(\d+):\d+$/);
			if (!m) continue;
			if (
				m[1].includes('logStore') ||
				m[1].includes('fetchInterceptor') ||
				m[1].includes('node_modules') ||
				m[1].startsWith('node:')
			) {
				continue;
			}
			const fn = paren ? (raw.split(' ')[0] ?? '') : '';
			return fn && fn !== '<anonymous>' ? `${fn} (${m[1]}:${m[2]})` : `${m[1]}:${m[2]}`;
		}
	} catch {
		/* ignore */
	}
	return '';
}

function notify(state: LogStoreState, log: ServerLogEntry) {
	for (const listener of state.listeners) {
		try {
			listener(log);
		} catch {
			/* ignore listener errors */
		}
	}
}

// --- Infinite render-loop / burst detection -------------------------------
// A runaway loop on the server (e.g. a fetch inside a reactive loop or a
// recursively re-queued job) floods pushLog within a short window. Emit a
// single warning entry per window pointing at the hottest URL.
function detectServerBurst(url: string, initiator?: string) {
	const state = getStoreState();
	if (state.emittingBurstWarning) return;
	const now = Date.now();
	const cutoff = now - BURST_WINDOW_MS;

	state.burstTimestamps.push(now);
	let i = 0;
	while (i < state.burstTimestamps.length && state.burstTimestamps[i] < cutoff) i++;
	if (i > 0) state.burstTimestamps = state.burstTimestamps.slice(i);

	if (state.burstTimestamps.length >= BURST_THRESHOLD && now - state.burstWarnedAt >= BURST_WINDOW_MS) {
		state.burstWarnedAt = now;
		state.burstTimestamps = []; // reset window so the flood itself doesn't re-trigger

		state.emittingBurstWarning = true;
		try {
			const entry: ServerLogEntry = {
				id: ++state.seq,
				timestamp: new Date().toISOString(),
				method: '-',
				url,
				success: false,
				status: null,
				duration_ms: null,
				initiator: initiator || 'server',
				error: 'Possible infinite render loop detected',
				details:
					`Detected ${BURST_THRESHOLD}+ server log entries within ${BURST_WINDOW_MS}ms.\n` +
					`Hottest endpoint: ${url}\n` +
					`Initiator: ${initiator || 'unknown'}\n\n` +
					`A runaway loop is hammering the server — check for fetches inside ` +
					`useEffect / useMemo blocks, reactive subscriptions, or recursively ` +
					`re-queued jobs.`
			};
			state.logs.push(entry);
			if (state.logs.length > MAX_LOGS) state.logs.splice(0, state.logs.length - MAX_LOGS);
			notify(state, entry);
		} finally {
			state.emittingBurstWarning = false;
		}
	}
}

/** Record an API/fetch call outcome and notify live SSE subscribers. */
export function pushLog(entry: Omit<ServerLogEntry, 'id' | 'timestamp'>): ServerLogEntry {
	detectServerBurst(entry.url || '', entry.initiator);
	const state = getStoreState();
	const log: ServerLogEntry = { id: ++state.seq, timestamp: new Date().toISOString(), ...entry };
	log.initiator = log.initiator || getRequestInitiator() || captureServerInitiator() || 'Server';
	state.logs.push(log);
	if (state.logs.length > MAX_LOGS) state.logs.splice(0, state.logs.length - MAX_LOGS);
	notify(state, log);
	return log;
}

/** Clear all buffered logs. */
export function clearLogs() {
	const state = getStoreState();
	state.logs.length = 0;
}

/** Number of buffered entries (for UI badges). */
export function getLogCount(): number {
	return getStoreState().logs.length;
}

/** Entries with id > startId (replay on client reconnect). */
export function getLogsSince(startId = 0): ServerLogEntry[] {
	return getStoreState().logs.filter((l) => l.id > startId);
}

/** Subscribe to live log entries; returns an unsubscribe function. */
export function subscribeLogs(listener: (log: ServerLogEntry) => void): () => void {
	const state = getStoreState();
	state.listeners.add(listener);
	return () => {
		state.listeners.delete(listener);
	};
}