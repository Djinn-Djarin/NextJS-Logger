// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('Workflow: server-side fetch interception', () => {
	let originalFetch: typeof globalThis.fetch;

	beforeEach(() => {
		originalFetch = globalThis.fetch;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
		delete (globalThis as any).__nextLogInspectorFetchInstalled;
	});

	it('wraps globalThis.fetch and captures outbound calls', async () => {
		const { installServerFetchInterceptor } = await import('../server/fetchInterceptor');
		const { getStoreState, clearLogs } = await import('../server/logStore');
		clearLogs();
		getStoreState().seq = 0;

		const fakeResponse = new Response(JSON.stringify({ ok: true }), { status: 200 });
		globalThis.fetch = vi.fn().mockResolvedValue(fakeResponse);

		const uninstall = installServerFetchInterceptor();

		await globalThis.fetch('https://api.stripe.com/v1/charges');

		const logs = getStoreState().logs;
		expect(logs.length).toBeGreaterThanOrEqual(1);
		const entry = logs.find((l) => l.url.includes('stripe'));
		expect(entry).toBeTruthy();
		expect(entry!.method).toBe('GET');
		expect(entry!.status).toBe(200);
		expect(entry!.success).toBe(true);
		expect(entry!.duration_ms).toBeGreaterThanOrEqual(0);

		uninstall();
	});

	it('captures POST requests with request body', async () => {
		const { installServerFetchInterceptor } = await import('../server/fetchInterceptor');
		const { getStoreState, clearLogs } = await import('../server/logStore');
		clearLogs();
		getStoreState().seq = 0;

		const fakeResponse = new Response(JSON.stringify({ id: 1 }), { status: 201 });
		globalThis.fetch = vi.fn().mockResolvedValue(fakeResponse);

		const uninstall = installServerFetchInterceptor();

		await globalThis.fetch('https://db.example.com/query', {
			method: 'POST',
			body: JSON.stringify({ query: 'SELECT 1' })
		});

		const logs = getStoreState().logs;
		const entry = logs.find((l) => l.url.includes('db.example'));
		expect(entry).toBeTruthy();
		expect(entry!.method).toBe('POST');
		expect(entry!.request_body).toEqual({ query: 'SELECT 1' });

		uninstall();
	});

	it('captures failed fetch calls with error', async () => {
		const { installServerFetchInterceptor } = await import('../server/fetchInterceptor');
		const { getStoreState, clearLogs } = await import('../server/logStore');
		clearLogs();
		getStoreState().seq = 0;

		globalThis.fetch = vi.fn().mockRejectedValue(new Error('network timeout'));

		const uninstall = installServerFetchInterceptor();

		await expect(globalThis.fetch('https://unreachable.service/api')).rejects.toThrow('network timeout');

		const logs = getStoreState().logs;
		const entry = logs.find((l) => l.url.includes('unreachable'));
		expect(entry).toBeTruthy();
		expect(entry!.success).toBe(false);
		expect(entry!.error).toBe('network timeout');

		uninstall();
	});

	it('skips logging inspector endpoints by default', async () => {
		const { installServerFetchInterceptor } = await import('../server/fetchInterceptor');
		const { getStoreState, clearLogs } = await import('../server/logStore');
		clearLogs();
		getStoreState().seq = 0;

		const fakeResponse = new Response('ok');
		globalThis.fetch = vi.fn().mockResolvedValue(fakeResponse);

		const uninstall = installServerFetchInterceptor();

		await globalThis.fetch('http://localhost/api/log-inspector/stream');

		const logs = getStoreState().logs;
		expect(logs).toHaveLength(0);

		uninstall();
	});

	it('uninstall stops wrapping fetch', async () => {
		const { installServerFetchInterceptor } = await import('../server/fetchInterceptor');

		const fakeResponse = new Response('ok');
		globalThis.fetch = vi.fn().mockResolvedValue(fakeResponse);

		const uninstall = installServerFetchInterceptor();
		const wrappedFetch = globalThis.fetch;

		uninstall();

		expect(globalThis.fetch).not.toBe(wrappedFetch);
	});
});
