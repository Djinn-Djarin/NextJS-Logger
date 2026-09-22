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
	const recentFetches = new Map<string, number>();

	const createWrappedFetch = (targetFetch: typeof fetch) => {
		return function wrapped(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
			const isRequest = typeof Request !== 'undefined' && input instanceof Request;
			const url = isRequest ? input.url : String(input);
			const method = (isRequest ? input.method : init?.method || 'GET').toUpperCase();
			const logIt = shouldLog(input, init);

			let requestBody: unknown;
			if (logIt && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
				try {
					if (typeof init?.body === 'string') {
						try {
							requestBody = JSON.parse(init.body);
						} catch {
							requestBody = init.body;
						}
					} else if (init?.body) {
						requestBody = '[Non-string Request Body Omitted]';
					}
				} catch {
					/* body not readable */
				}
			}

			const initiator = captureServerInitiator() || undefined;
			const t0 = performance.now();
			const dedupKey = `${method}:${url}`;
			
			if (logIt) {
				const existingId = recentFetches.get(dedupKey);
				if (existingId !== undefined) {
					// This exact fetch was fired synchronously within the last 10ms.
					// It's a React Strict Mode ghost duplicate. Just return the Promise without logging!
					return targetFetch(input, init);
				}
			}

			let pendingLogId: number | undefined;
			if (logIt) {
				const pl = pushLog({
					method,
					url,
					success: true,
					status: null,
					duration_ms: null,
					initiator,
					request_body: capBody(requestBody),
					pending: true
				});
				pendingLogId = pl.id;
				
				if (pendingLogId !== undefined) {
					recentFetches.set(dedupKey, pendingLogId);
					setTimeout(() => recentFetches.delete(dedupKey), 10);
				}
			}
			const reqPromise = targetFetch(input, init);
			
			reqPromise.then(
				(res) => {
					if (logIt) {
						const duration_ms = Math.round(performance.now() - t0);
						const cacheHeader = res.headers.get('x-nextjs-cache') || res.headers.get('x-cache') || '';
						const isCacheHit = duration_ms <= 1 || /hit/i.test(cacheHeader);
						
						const baseUpdate = {
							method,
							url,
							success: res.ok,
							status: res.status,
							duration_ms,
							initiator,
							cached: isCacheHit,
							pending: false,
							isUpdate: true as const
						};

						pushLog({
							id: pendingLogId,
							request_body: capBody(requestBody),
							response_body: '[Response stream passed through natively. Waiting for Next.js to consume it...]',
							...baseUpdate
						});

						try {
							const contentType = res.headers.get('content-type') || '';
							// Do not touch RSC payloads (Next.js internal flight streams)
							if (contentType.includes('text/x-component')) return;

							// Patch .json()
							if (typeof res.json === 'function') {
								const originalJson = res.json.bind(res);
								res.json = async function () {
									const data = await originalJson();
									pushLog({ id: pendingLogId, request_body: capBody(requestBody), response_body: capBody(data), ...baseUpdate });
									return data;
								};
							}

							// Patch .text()
							if (typeof res.text === 'function') {
								const originalText = res.text.bind(res);
								res.text = async function () {
									const text = await originalText();
									pushLog({ id: pendingLogId, request_body: capBody(requestBody), response_body: capBody(text), ...baseUpdate });
									return text;
								};
							}

							// Patch .body.getReader()
							if (res.body && typeof res.body.getReader === 'function') {
								const originalGetReader = res.body.getReader.bind(res.body);
								(res.body as any).getReader = function (...args: any[]) {
									const reader = originalGetReader(...args);
									const originalRead = reader.read.bind(reader);
									let chunks: Uint8Array[] = [];
									let totalBytes = 0;
									const MAX_BYTES = 1000000; // Stop buffering at 1MB

									reader.read = async function (...readArgs: any[]) {
										// @ts-ignore
										const result = await originalRead(...readArgs);
										if (!result.done && result.value) {
											if (totalBytes < MAX_BYTES) {
												chunks.push(result.value);
												totalBytes += result.value.length;
											}
										} else if (result.done && totalBytes > 0) {
											try {
												const combined = new Uint8Array(totalBytes);
												let offset = 0;
												for (const chunk of chunks) {
													combined.set(chunk, offset);
													offset += chunk.length;
												}
												const text = new TextDecoder('utf-8', { fatal: false }).decode(combined);
												let finalBody: any = text;
												try { finalBody = JSON.parse(text); } catch { /* ignore */ }
												pushLog({ id: pendingLogId, request_body: capBody(requestBody), response_body: capBody(finalBody), ...baseUpdate });
											} catch {
												pushLog({ id: pendingLogId, request_body: capBody(requestBody), response_body: `[Stream consumed: ${totalBytes} bytes]`, ...baseUpdate });
											}
										}
										return result;
									};
									return reader;
								};
							}
						} catch {
							/* safely ignore any errors while attempting to monkey-patch */
						}
					}
				},
				(err) => {
					if (logIt) {
						pushLog({
							id: pendingLogId,
							method,
							url,
							success: false,
							status: null,
							duration_ms: Math.round(performance.now() - t0),
							error: (err as Error)?.message || String(err),
							initiator,
							request_body: capBody(requestBody),
							pending: false,
							isUpdate: true
						});
					}
				}
			);

			return reqPromise;
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