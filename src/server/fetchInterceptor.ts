import { pushLog, capBody, captureServerInitiator } from './logStore';

export interface FetchInterceptorOptions {
	/** Decide whether a given fetch should be logged. Default: everything except the inspector's own endpoints. */
	shouldLog?: (input: RequestInfo | URL, init?: RequestInit) => boolean;
}

const GLOBAL_FLAG = '__nextLogInspectorFetchInstalled';

/**
 * Install a global `fetch` wrapper on the server so EVERY outbound call is
 * captured automatically with initiator (file:line), duration and bodies.
 * This removes the need for any manual per-call logging code.
 *
 * Returns an uninstall function. Safe to call multiple times (no-op on repeat).
 */
export function installServerFetchInterceptor(options: FetchInterceptorOptions = {}): () => void {
	if (typeof globalThis.fetch !== 'function') return () => {};
	const g = globalThis as unknown as { [GLOBAL_FLAG]?: boolean };
	if (g[GLOBAL_FLAG]) return () => {};
	g[GLOBAL_FLAG] = true;

	const shouldLog = options.shouldLog ?? ((input: RequestInfo | URL) => !String(input).includes('api/log-inspector'));

	let realFetch = globalThis.fetch;

	const createWrappedFetch = (targetFetch: typeof fetch) => {
		return async function wrapped(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
			const isRequest = typeof Request !== 'undefined' && input instanceof Request;
			const url = isRequest ? input.url : String(input);
			const method = (isRequest ? input.method : init?.method || 'GET').toUpperCase();
			const logIt = shouldLog(input, init);

			let requestBody: unknown;
			if (logIt && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
				try {
					if (isRequest) {
						const text = await input.clone().text();
						try {
							requestBody = JSON.parse(text);
						} catch {
							requestBody = text;
						}
					} else if (typeof init?.body === 'string') {
						try {
							requestBody = JSON.parse(init.body);
						} catch {
							requestBody = init.body;
						}
					}
				} catch {
					/* body not readable */
				}
			}

			const initiator = captureServerInitiator();
			const t0 = performance.now();
			let res: Response;
			try {
				res = await targetFetch(input, init);
			} catch (err) {
				if (logIt) {
					pushLog({
						method,
						url,
						success: false,
						status: null,
						duration_ms: Math.round(performance.now() - t0),
						error: (err as Error)?.message || String(err),
						initiator,
						request_body: capBody(requestBody)
					});
				}
				throw err;
			}

			const duration_ms = Math.round(performance.now() - t0);
			let responseBody: unknown = undefined;
			if (logIt) {
				// Next.js 15 + undici has a known bug where response cloning deadlocks.
				// We avoid reading the response body for outbound fetches to prevent the app from hanging.
				const cacheHeader = res.headers.get('x-nextjs-cache') || res.headers.get('x-cache') || '';
				const isCacheHit = duration_ms <= 1 || /hit/i.test(cacheHeader);
				pushLog({
					method,
					url,
					success: res.ok,
					status: res.status,
					duration_ms,
					initiator,
					request_body: capBody(requestBody),
					response_body: undefined,
					cached: isCacheHit
				});
			}
			return res;
		};
	};

	let activeWrapped = createWrappedFetch(realFetch);

	try {
		Object.defineProperty(globalThis, 'fetch', {
			configurable: true,
			enumerable: true,
			get() {
				return activeWrapped;
			},
			set(fn: typeof fetch) {
				if (typeof fn === 'function' && fn !== activeWrapped) {
					realFetch = fn;
					activeWrapped = createWrappedFetch(fn);
				}
			}
		});
	} catch {
		globalThis.fetch = activeWrapped as typeof fetch;
	}

	return () => {
		try {
			delete (globalThis as any)[GLOBAL_FLAG];
			globalThis.fetch = realFetch;
		} catch {
			/* ignore */
		}
	};
}