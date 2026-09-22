import { clientConfig, getEffectiveBasePath } from './config';

export interface LogEntry {
	id: string;
	timestamp: string;
	message: string;
	details?: string;
	type: 'info' | 'success' | 'error' | 'user';
	expanded?: boolean; // UI state
	tag?: string;
	method?: string;
	url?: string;
	status?: number | string;
	duration_ms?: number;
	initiator?: string;
	request_body?: unknown;
	response_body?: unknown;
	cached?: boolean;
	pending?: boolean;
	isUpdate?: boolean;
	startTime?: number;
}

export interface LogMeta {
	tag?: string;
	method?: string;
	url?: string;
	status?: number | string;
	duration_ms?: number;
	initiator?: string;
	request_body?: unknown;
	response_body?: unknown;
	cached?: boolean;
	pending?: boolean;
	isUpdate?: boolean;
	startTime?: number;
}

/** Minimal framework-agnostic external store (React `useSyncExternalStore`-compatible). */
export interface ExternalStore<T> {
	subscribe: (listener: () => void) => () => void;
	getSnapshot: () => T;
	getServerSnapshot: () => T;
	set: (value: T) => void;
	update: (updater: (prev: T) => T) => void;
}

function createStore<T>(initial: T): ExternalStore<T> {
	let value = initial;
	const listeners = new Set<() => void>();
	return {
		subscribe(listener) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		getSnapshot() {
			return value;
		},
		getServerSnapshot() {
			return initial;
		},
		set(next: T) {
			value = next;
			for (const fn of listeners) {
				try {
					fn();
				} catch {
					/* ignore */
				}
			}
		},
		update(updater) {
			value = updater(value);
			for (const fn of listeners) {
				try {
					fn();
				} catch {
					/* ignore */
				}
			}
		}
	};
}

const SAVED_LIMIT_KEY = 'li-saved-limit';

export function getSavedRecordsLimit(): number {
	if (typeof window !== 'undefined') {
		const val = localStorage.getItem(SAVED_LIMIT_KEY);
		if (val) {
			const parsed = parseInt(val, 10);
			if (!isNaN(parsed) && parsed > 0) return parsed;
		}
	}
	return 50;
}

export function setSavedRecordsLimit(limit: number): void {
	if (typeof window !== 'undefined') {
		localStorage.setItem(SAVED_LIMIT_KEY, String(limit));
	}
}

function createTerminalStore(): ExternalStore<LogEntry[]> & {
	addLog: (message: string, type?: LogEntry['type'], details?: string, meta?: LogMeta) => string;
	updateLog: (id: string, updater: (entry: LogEntry) => Partial<LogEntry>) => void;
	clear: () => void;
	rePersist: () => void;
} {
	const store = createStore<LogEntry[]>([]);

	let persistTimeout: ReturnType<typeof setTimeout>;
	function persist(logs: LogEntry[]) {
		if (typeof window !== 'undefined' && clientConfig.persist) {
			clearTimeout(persistTimeout);
			persistTimeout = setTimeout(() => {
				try {
					const limit = getSavedRecordsLimit();
					const slim = logs.slice(-limit).map(({ request_body, response_body, ...rest }) => rest);
					localStorage.setItem(clientConfig.storageKey, JSON.stringify(slim));
				} catch {
					/* ignore */
				}
			}, 300);
		}
	}

	function addEntry(entry: LogEntry) {
		store.update((logs) => {
			const limit = getSavedRecordsLimit();
			const next = [...logs.slice(-(limit - 1)), entry];
			persist(next);
			return next;
		});
		if (entry.type === 'error') {
			unreadErrorCount.update((n) => n + 1);
		}
	}

	function hydrate() {
		if (typeof window !== 'undefined' && clientConfig.persist) {
			try {
				const stored = localStorage.getItem(clientConfig.storageKey);
				if (stored) store.set(JSON.parse(stored));
			} catch {
				/* ignore */
			}
		}
	}

	// Hydrate persisted logs once at import time (client-only module).
	if (typeof window !== 'undefined') {
		try {
			hydrate();
		} catch {
			/* ignore */
		}
	}

	return {
		...store,
		addLog: (message: string, type: LogEntry['type'] = 'info', details?: string, meta?: LogMeta & { id?: string }) => {
			const id = meta?.id || Math.random().toString(36).substring(2, 9);
			addEntry({
				id,
				timestamp: new Date().toLocaleTimeString(),
				message,
				details,
				type,
				expanded: false,
				...meta
			});
			return id;
		},
		updateLog: (id: string, updater: (entry: LogEntry) => Partial<LogEntry>) => {
			store.update((logs) => {
				const next = logs.map((l) => (l.id === id ? { ...l, ...updater(l) } : l));
				persist(next);
				return next;
			});
		},
		clear: () => {
			store.set([]);
			persist([]);
			unreadErrorCount.set(0);
			if (typeof window !== 'undefined') {
				fetch(`${getEffectiveBasePath()}/clear`, { method: 'POST' }).catch(() => {});
			}
		},
		rePersist: () => {
			store.update((logs) => {
				const limit = getSavedRecordsLimit();
				const next = logs.slice(-limit);
				persist(next);
				return next;
			});
		}
	};
}

export const terminalStore = createTerminalStore();

/** Global store controlling if the inspector is capturing logs. */
export const isInspectorEnabled: ExternalStore<boolean> = createStore(true);


/** Count of error logs that arrived since the terminal was last collapsed. */
export const unreadErrorCount: ExternalStore<number> = createStore(0);

export function markErrorsRead() {
	unreadErrorCount.set(0);
}

/** Global store controlling the collapsed state of the inspector UI. */
export const isTerminalCollapsed: ExternalStore<boolean> = createStore(true);

/** Count of currently pending (in-flight) log entries. */
export const pendingCount: ExternalStore<number> & { recalculate: () => void } = (() => {
	const store = createStore(0);
	let lastSnapshot: LogEntry[] = [];

	function recalculate() {
		const logs = terminalStore.getSnapshot();
		if (logs === lastSnapshot) return;
		lastSnapshot = logs;
		const count = logs.filter((l) => {
			if (!l.pending) return false;
			if (l.status !== undefined && l.status !== null && l.status !== 'Pending') {
				return false;
			}
			return true;
		}).length;
		store.set(count);
	}

	// Subscribe to terminal store changes and recalculate
	terminalStore.subscribe(() => {
		recalculate();
	});

	return { ...store, recalculate };
})();

/**
 * Hijack console methods + window errors and unhandled rejections so they are
 * captured into the log store automatically — no per-call code needed.
 */
let isGlobalErrorHandlingInitialized = false;

export function initGlobalErrorHandling() {
	if (typeof window === 'undefined') return;
	if (isGlobalErrorHandlingInitialized) return;
	isGlobalErrorHandlingInitialized = true;

	window.addEventListener('error', (event) => {
		const msg = event.message;
		const details = `File: ${event.filename}\nLine: ${event.lineno}\nColumn: ${event.colno}\n\nStack:\n${event.error?.stack || 'N/A'}`;
		terminalStore.addLog(`[Uncaught Error] ${msg}`, 'error', details);
	});

	window.addEventListener('unhandledrejection', (event) => {
		const reason = event.reason;
		const msg = reason instanceof Error ? reason.message : String(reason);
		const details = reason instanceof Error ? reason.stack || '' : '';
		terminalStore.addLog(`[Unhandled Promise] ${msg}`, 'error', details);
	});

	let isLogging = false;
	const methods: ('log' | 'warn' | 'error' | 'info')[] = ['log', 'warn', 'error', 'info'];
	methods.forEach((method) => {
		const original = console[method];
		console[method] = function (...args) {
			original.apply(console, args);

			if (isLogging || !isInspectorEnabled.getSnapshot()) return;
			isLogging = true;

			try {
				const err = new Error();
				const stack = err.stack?.split('\n') || [];
				const caller = stack[2] || '';
				const location = caller.trim().replace(/^at\s+/, '');

				const msg = args
					.map((a) => {
						if (a === null) return 'null';
						if (typeof a !== 'object') return String(a);
						if (a instanceof Error) return a.stack || a.message;
						if (typeof HTMLElement !== 'undefined' && a instanceof HTMLElement) return `<${a.tagName.toLowerCase()}>`;
						const cache = new Set();
						try {
							return JSON.stringify(a, (key, value) => {
								if (typeof value === 'object' && value !== null) {
									if (cache.has(value)) return '[Circular]';
									cache.add(value);
								}
								return value;
							});
						} catch {
							return String(a);
						}
					})
					.join(' ');
				const type: 'info' | 'success' | 'error' | 'user' = method === 'error' ? 'error' : 'info';

				queueMicrotask(() => {
					terminalStore.addLog(`[console.${method}] ${msg}`, type, location ? `Location: ${location}` : undefined);
				});
			} catch {
				/* ignore errors in hijacking */
			} finally {
				isLogging = false;
			}
		};
	});
}