import { getLogsSince, subscribeLogs, clearLogs, type ServerLogEntry } from './logStore';

export interface StreamHandlerOptions {
	/** Query param carrying the "since" cursor, e.g. `?since=42`. */
	sinceParam?: string;
	/** Heartbeat interval in ms. */
	pingMs?: number;
}

/**
 * Server-Sent Events handler for live server logs. Point a generated route
 * handler's `GET` at this:
 *
 *   import { streamHandler } from 'nextjs-log-inspector/server';
 *   export const runtime = 'nodejs';
 *   export const dynamic = 'force-dynamic';
 *   export const GET = streamHandler();
 *
 * Replays buffered entries, then streams every new call.
 */
export function streamHandler(options: StreamHandlerOptions = {}) {
	const sinceParam = options.sinceParam ?? 'since';
	const pingMs = options.pingMs ?? 15_000;
	const encoder = new TextEncoder();

	return (request: Request): Response => {
		const lastEventId = request.headers.get('Last-Event-ID');
		const url = new URL(request.url);
		const sinceValue = url.searchParams.get(sinceParam);
		const startId = lastEventId ? parseInt(lastEventId, 10) : sinceValue !== null ? parseInt(sinceValue, 10) : 0;

		const teardown: { cleanup: (() => void) | null } = { cleanup: null };

		const stream = new ReadableStream<Uint8Array>({
			start(controller) {
				let ping: ReturnType<typeof setInterval> | null = null;
				let unsubscribe: (() => void) | null = null;

				const send = (event: string, data: unknown, id?: number) => {
					try {
						const idStr = id !== undefined ? `id: ${id}\n` : '';
						controller.enqueue(encoder.encode(`${idStr}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
					} catch {
						/* stream closed */
					}
				};

				unsubscribe = subscribeLogs((log: ServerLogEntry) => {
					send('api-log', log, log.id);
				});

				if (startId >= 0) {
					for (const log of getLogsSince(startId)) {
						send('api-log', log, log.id);
					}
				}
				send('ready', { ok: true });

				ping = setInterval(() => {
					send('ping', { t: Date.now() });
				}, pingMs);

				teardown.cleanup = () => {
					if (ping) clearInterval(ping);
					if (unsubscribe) unsubscribe();
					try {
						controller.close();
					} catch {
						/* already closed */
					}
				};
			},
			cancel() {
				if (teardown.cleanup) {
					teardown.cleanup();
					teardown.cleanup = null;
				}
			}
		});

		// Tear down the stream when the client disconnects.
		if (request.signal.aborted) {
			if (teardown.cleanup) teardown.cleanup();
		} else {
			request.signal.addEventListener('abort', () => {
				if (teardown.cleanup) {
					teardown.cleanup();
					teardown.cleanup = null;
				}
			});
		}

		return new Response(stream, {
			headers: {
				'Content-Type': 'text/event-stream',
				'Cache-Control': 'no-cache',
				Connection: 'keep-alive',
				'X-Accel-Buffering': 'no'
			}
		});
	};
}

/** POST handler that clears all buffered logs. */
export async function clearHandler(): Promise<Response> {
	clearLogs();
	return Response.json({ ok: true });
}