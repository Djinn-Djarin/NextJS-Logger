import { initGlobalErrorHandling } from './store';
import { startLogStream, stopLogStream } from './sse';
import { installClientFetchInterceptor } from './fetchInterceptor';
import { configureClient, clientConfig, type ClientConfig } from './config';

export * from './config';
export * from './store';
export * from './sse';
export * from './captureInitiator';
export { installClientFetchInterceptor } from './fetchInterceptor';

export interface InitClientOptions {
	config?: Partial<ClientConfig>;
	/** Automatically mirror server-side API logs via SSE. Default true. */
	stream?: boolean;
	/** Install the client fetch wrapper (X-Initiator header). Default true. */
	fetchInterceptor?: boolean;
	/** Enable the fetch interceptor's optional external-call logging. */
	logExternal?: boolean;
}

/**
 * Direct log to inspector without printing to native browser console
 */
export function inspectLog(message: string, type: 'info' | 'warn' | 'error' | 'success' | 'user' = 'info', details?: any) {
	const parsed = details !== undefined ? (typeof details === 'object' ? JSON.stringify(details, null, 2) : String(details)) : undefined;
	import('./store').then(({ terminalStore }) => {
		terminalStore.addLog(message, type === 'warn' ? 'info' : type, parsed, {
			tag: 'inspectLog',
			initiator: 'inspectLog'
		});
	});
}

/**
 * One-call client bootstrap: hijacks console/errors, opens the SSE log stream
 * and (optionally) wraps `fetch` for initiator capture. Safe to call more than
 * once. Returns a cleanup function.
 */
export function initClientLogging(options: InitClientOptions = {}): () => void {
	if (typeof window === 'undefined') return () => {};
	if (options.config) configureClient(options.config);

	initGlobalErrorHandling();

	const stopStream = options.stream === false ? () => {} : startLogStream();
	if (options.fetchInterceptor !== false) {
		installClientFetchInterceptor({ logExternal: options.logExternal });
	}

	return () => {
		try {
			stopStream();
		} catch {
			/* ignore */
		}
	};
}

export { stopLogStream, startLogStream, clientConfig };

// Zero-code: importing the client module wires up console + error capture and
// the log stream. The UI component calls initClientLogging() on mount too.
if (typeof window !== 'undefined') {
	initGlobalErrorHandling();
}