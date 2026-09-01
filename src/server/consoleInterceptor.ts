import { pushLog, captureServerInitiator } from './logStore';

let installed = false;

export function installServerConsoleInterceptor() {
	if (installed) return;
	installed = true;

	const methods: ('log' | 'warn' | 'error' | 'info')[] = ['log', 'warn', 'error', 'info'];

	methods.forEach((method) => {
		const original = console[method];
		console[method] = function (...args) {
			original.apply(console, args);
			try {
				const msg = args
					.map((a) => {
						if (typeof a === 'object') {
							try {
								return JSON.stringify(a);
							} catch {
								return String(a);
							}
						}
						return String(a);
					})
					.join(' ');

				// Strip terminal ANSI color codes so they don't show up as gibberish in the browser UI
				const cleanMsg = msg.replace(/\x1b\[[0-9;]*m/g, '');

				pushLog({
					method: '-',
					url: `[Server Console] ${cleanMsg}`,
					success: method !== 'error',
					status: null,
					duration_ms: null,
					error: method === 'error' ? 'error' : undefined,
					initiator: captureServerInitiator() || 'Server Console'
				});
			} catch {
				/* ignore */
			}
		};
	});
}

/**
 * Direct log to inspector without printing to native server console
 */
export function inspectLog(message: string, type: 'info' | 'warn' | 'error' | 'success' | 'user' = 'info', details?: any) {
	const parsed = details !== undefined ? (typeof details === 'object' ? JSON.stringify(details, null, 2) : String(details)) : undefined;
	pushLog({
		method: '-',
		url: `[Server Inspect] ${message}`,
		success: type !== 'error',
		status: null,
		duration_ms: null,
		error: type === 'error' ? 'error' : undefined,
		details: parsed,
		initiator: captureServerInitiator() || 'inspectLog'
	});
}
