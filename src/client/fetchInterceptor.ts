import { isInspectorEnabled } from "./store";
import { captureInitiator } from './captureInitiator';

export interface ClientFetchInterceptorOptions {
	/** Only add the initiator header to same-origin requests (avoids CORS preflights). */
	sameOriginOnly?: boolean;
	/**
	 * Also log calls made by the browser directly to external servers
	 * (e.g. your backend API). The server-side capture already logs same-origin
	 * `/api/*` calls, so those are never double-logged here.
	 */
	logExternal?: boolean;
}

const GLOBAL_FLAG = '__nextLogInspectorClientFetchInstalled';

/**
 * Wrap the browser `fetch` so the calling file:line is captured automatically
 * and sent to the server via the `X-Initiator` header. The server-side capture
 * picks it up and records it with the request — no custom client needed.
 *
 * Optionally logs direct-to-external-server calls into the client store.
 */
export function installClientFetchInterceptor(options: ClientFetchInterceptorOptions = {}): () => void {
	if (typeof window === 'undefined' || typeof globalThis.fetch !== 'function') return () => {};
	const g = globalThis as unknown as { [GLOBAL_FLAG]?: boolean };
	if (g[GLOBAL_FLAG]) return () => {};
	g[GLOBAL_FLAG] = true;

	const sameOriginOnly = options.sameOriginOnly !== false;
	const logExternal = options.logExternal === true;
	const originalFetch = globalThis.fetch.bind(globalThis);

	const wrapped = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
		// Import dynamically to avoid circular dependencies during initialization
		
		if (!isInspectorEnabled.getSnapshot()) return originalFetch(input, init);

		const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
		if (url.includes('/log-inspector/')) return originalFetch(input, init);

		let requestInit = init;

		try {
			let isSameOrigin = true;
			if (sameOriginOnly) {
				try {
					isSameOrigin = new URL(url, window.location.href).origin === window.location.origin;
				} catch {
					isSameOrigin = true;
				}
			}

			if (isSameOrigin) {
				const initiator = captureInitiator();
				const headers = new Headers(init?.headers);
				if (!headers.has('X-Initiator')) headers.set('X-Initiator', initiator);
				requestInit = { ...init, headers };
			} else if (logExternal) {
				const initiator = captureInitiator();
				const { terminalStore } = await import('./store');
				const method = (requestInit?.method || (typeof input === 'string' ? 'GET' : 'GET')).toUpperCase();
				const t0 = performance.now();
				let request_body: unknown = undefined;
				if (requestInit?.body) {
					try {
						request_body = typeof requestInit.body === 'string' ? JSON.parse(requestInit.body) : requestInit.body;
					} catch {
						request_body = requestInit.body;
					}
				}

				const logId = terminalStore.addLog(
					`[API] ${method} ${url} — pending...`,
					'info',
					undefined,
					{
						tag: 'api client',
						method,
						url,
						initiator,
						request_body,
						pending: true,
						startTime: Date.now()
					}
				);

				try {
					const res = await originalFetch(input, requestInit);
					const duration_ms = Math.round(performance.now() - t0);
					
					let response_body: unknown = undefined;
					try {
						const text = await res.clone().text();
						try {
							response_body = JSON.parse(text);
						} catch {
							response_body = text;
						}
					} catch {
						// Opaque response or stream reading failed
					}

					terminalStore.updateLog(logId, () => ({
						message: `[API] ${method} ${url} — ${res.ok ? 'success' : 'failed'} (HTTP ${res.status} · ${duration_ms}ms)`,
						type: res.ok ? 'success' : 'error',
						pending: false,
						status: res.status,
						duration_ms,
						response_body
					}));
					return res;
				} catch (err) {
					const duration_ms = Math.round(performance.now() - t0);
					terminalStore.updateLog(logId, () => ({
						message: `[API] ${method} ${url} — failed (${(err as Error)?.message || 'network error'})`,
						type: 'error',
						pending: false,
						status: 0,
						duration_ms
					}));
					throw err;
				}
			}
		} catch {
			/* if header injection fails, fall through to plain fetch */
		}

		return originalFetch(input, requestInit);
	};

	globalThis.fetch = wrapped as typeof fetch;
	return () => {
		if (globalThis.fetch === (wrapped as unknown)) {
			globalThis.fetch = originalFetch;
		}
	};
}