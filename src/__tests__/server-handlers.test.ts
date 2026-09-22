// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { streamHandler, clearHandler } from '../server/handlers';
import { pushLog, clearLogs, getLogCount, getStoreState } from '../server/logStore';

beforeEach(() => {
	clearLogs();
	const state = getStoreState();
	state.seq = 0;
});

function createMockRequest(url = 'http://localhost/api/log-inspector/stream', lastEventId?: string): Request {
	const headers: Record<string, string> = {};
	if (lastEventId) headers['Last-Event-ID'] = lastEventId;
	return new Request(url, { headers });
}

async function readStreamUntil(res: Response, predicate: (text: string) => boolean, timeoutMs = 3000): Promise<string> {
	const reader = res.body!.getReader();
	const decoder = new TextDecoder();
	let accumulated = '';
	const deadline = Date.now() + timeoutMs;

	try {
		while (Date.now() < deadline) {
			const { value, done } = await Promise.race([
				reader.read(),
				new Promise<{ value: undefined; done: true }>((r) => setTimeout(() => r({ value: undefined, done: true }), deadline - Date.now()))
			]);
			if (done || value === undefined) break;
			accumulated += decoder.decode(value, { stream: true });
			if (predicate(accumulated)) break;
		}
	} finally {
		reader.cancel().catch(() => {});
	}
	return accumulated;
}

describe('Workflow: SSE stream delivery', () => {
	it('returns an SSE response with correct headers', () => {
		const handler = streamHandler();
		const res = handler(createMockRequest());

		expect(res).toBeInstanceOf(Response);
		expect(res.headers.get('Content-Type')).toBe('text/event-stream');
		expect(res.headers.get('Cache-Control')).toBe('no-cache');
		expect(res.headers.get('Connection')).toBe('keep-alive');
	});

	it('replays buffered logs as api-log events', async () => {
		pushLog({ method: 'GET', url: '/api/users', success: true, status: 200, duration_ms: 45 });
		pushLog({ method: 'POST', url: '/api/orders', success: true, status: 201, duration_ms: 120 });

		const handler = streamHandler();
		const res = handler(createMockRequest());

		const body = await readStreamUntil(res, (t) => t.includes('event: ready'));

		expect(body).toContain('event: api-log');
		expect(body).toContain('/api/users');
		expect(body).toContain('/api/orders');
		expect(body).toContain('event: ready');
	});

	it('delivers live entries as they are pushed', async () => {
		const handler = streamHandler();
		const res = handler(createMockRequest());

		const reader = res.body!.getReader();
		const decoder = new TextDecoder();

		// Read until ready event
		let text = '';
		while (true) {
			const { value, done } = await reader.read();
			if (done) break;
			text += decoder.decode(value, { stream: true });
			if (text.includes('event: ready')) break;
		}

		// Push a live entry
		pushLog({ method: 'GET', url: '/api/live', success: true, status: 200, duration_ms: 10 });

		// Read the live entry
		const { value: liveChunk } = await Promise.race([
			reader.read(),
			new Promise<{ value: undefined; done: true }>((r) => setTimeout(() => r({ value: undefined, done: true }), 2000))
		]);

		if (liveChunk) {
			const liveText = decoder.decode(liveChunk);
			expect(liveText).toContain('/api/live');
			expect(liveText).toContain('event: api-log');
		}

		reader.cancel().catch(() => {});
	});

	it('replays only entries after Last-Event-ID on reconnect', async () => {
		pushLog({ method: 'GET', url: '/api/1', success: true, status: 200, duration_ms: 1 });
		pushLog({ method: 'GET', url: '/api/2', success: true, status: 200, duration_ms: 2 });
		pushLog({ method: 'GET', url: '/api/3', success: true, status: 200, duration_ms: 3 });

		// Last-Event-ID: 2 means "send me entries with id > 2"
		const handler = streamHandler();
		const res = handler(createMockRequest('http://localhost/api/log-inspector/stream', '2'));
		const body = await readStreamUntil(res, (t) => t.includes('event: ready'));

		expect(body).not.toContain('/api/1');
		expect(body).not.toContain('/api/2');
		expect(body).toContain('/api/3');
	});

	it('replays only entries after ?since=N query param', async () => {
		pushLog({ method: 'GET', url: '/api/1', success: true, status: 200, duration_ms: 1 });
		pushLog({ method: 'GET', url: '/api/2', success: true, status: 200, duration_ms: 2 });
		pushLog({ method: 'GET', url: '/api/3', success: true, status: 200, duration_ms: 3 });

		// ?since=2 means entries with id > 2
		const handler = streamHandler();
		const res = handler(createMockRequest('http://localhost/api/log-inspector/stream?since=2'));
		const body = await readStreamUntil(res, (t) => t.includes('event: ready'));

		expect(body).not.toContain('/api/1');
		expect(body).not.toContain('/api/2');
		expect(body).toContain('/api/3');
	});

	it('sends ping heartbeat events', async () => {
		const handler = streamHandler({ pingMs: 50 });
		const res = handler(createMockRequest());

		const body = await readStreamUntil(res, (t) => t.includes('event: ping'), 2000);
		expect(body).toContain('event: ping');
	});

	it('cleans up on abort', async () => {
		const controller = new AbortController();
		const req = new Request('http://localhost/api/log-inspector/stream', {
			signal: controller.signal
		});

		const handler = streamHandler();
		const res = handler(req);

		const reader = res.body!.getReader();
		controller.abort();

		await expect(reader.cancel()).resolves.toBeUndefined();
	});
});

describe('Workflow: clear handler', () => {
	it('clears all buffered logs', async () => {
		pushLog({ method: 'GET', url: '/api/a', success: true, status: 200, duration_ms: 1 });
		pushLog({ method: 'GET', url: '/api/b', success: true, status: 200, duration_ms: 2 });
		expect(getLogCount()).toBe(2);

		const res = await clearHandler();
		expect(getLogCount()).toBe(0);
	});

	it('returns { ok: true } JSON', async () => {
		const res = await clearHandler();
		expect(res).toBeInstanceOf(Response);
		const body = await res.json();
		expect(body).toEqual({ ok: true });
	});
});
