// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { isInspectorEnabled, terminalStore } from '../client/store';

beforeEach(() => {
	terminalStore.clear();
	isInspectorEnabled.set(true);
});

describe('Workflow: client fetch interceptor — X-Initiator header', () => {
	let originalFetch: typeof globalThis.fetch;

	beforeEach(() => {
		originalFetch = globalThis.fetch;
		delete (globalThis as any).__nextLogInspectorClientFetchInstalled;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it('injects X-Initiator header on same-origin requests', async () => {
		const { installClientFetchInterceptor } = await import('../client/fetchInterceptor');

		const fakeResponse = new Response('ok');
		let capturedInitiator: string | null = null;
		globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
			const headers = new Headers(init?.headers);
			capturedInitiator = headers.get('X-Initiator');
			return fakeResponse;
		});

		const uninstall = installClientFetchInterceptor();

		await globalThis.fetch('/api/users');

		expect(capturedInitiator).toBeTruthy();
		expect(typeof capturedInitiator).toBe('string');

		uninstall();
	});

	it('does not inject X-Initiator on cross-origin requests (sameOriginOnly)', async () => {
		const { installClientFetchInterceptor } = await import('../client/fetchInterceptor');

		Object.defineProperty(window, 'location', {
			value: new URL('http://localhost:3000'),
			writable: true
		});

		const fakeResponse = new Response('ok');
		let capturedInitiator: string | null = null;
		globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
			const headers = new Headers(init?.headers);
			capturedInitiator = headers.get('X-Initiator');
			return fakeResponse;
		});

		const uninstall = installClientFetchInterceptor({ sameOriginOnly: true });

		await globalThis.fetch('https://external.com/api');

		expect(capturedInitiator).toBeNull();

		uninstall();
	});

	it('logs external calls when logExternal is true', async () => {
		const { installClientFetchInterceptor } = await import('../client/fetchInterceptor');

		Object.defineProperty(window, 'location', {
			value: new URL('http://localhost:3000'),
			writable: true
		});

		const fakeResponse = new Response(JSON.stringify({ data: 1 }), { status: 200 });
		globalThis.fetch = vi.fn().mockResolvedValue(fakeResponse);

		const uninstall = installClientFetchInterceptor({ sameOriginOnly: true, logExternal: true });

		await globalThis.fetch('https://external.com/api/data');

		const logs = terminalStore.getSnapshot();
		const entry = logs.find((l) => l.url?.includes('external.com'));
		expect(entry).toBeTruthy();
		expect(entry!.tag).toBe('api client');
		expect(entry!.status).toBe(200);

		uninstall();
	});

	it('does not log external calls when logExternal is false', async () => {
		const { installClientFetchInterceptor } = await import('../client/fetchInterceptor');

		Object.defineProperty(window, 'location', {
			value: new URL('http://localhost:3000'),
			writable: true
		});

		const fakeResponse = new Response('ok');
		globalThis.fetch = vi.fn().mockResolvedValue(fakeResponse);

		const uninstall = installClientFetchInterceptor({ sameOriginOnly: true, logExternal: false });

		await globalThis.fetch('https://external.com/api');

		const logs = terminalStore.getSnapshot();
		expect(logs).toHaveLength(0);

		uninstall();
	});

	it('uninstall stops wrapping fetch', async () => {
		const { installClientFetchInterceptor } = await import('../client/fetchInterceptor');

		const fakeResponse = new Response('ok');
		globalThis.fetch = vi.fn().mockResolvedValue(fakeResponse);

		const uninstall = installClientFetchInterceptor();
		const wrappedFetch = globalThis.fetch;

		uninstall();

		// After uninstall, calling fetch should go to the original (mock) directly
		// The wrapped version would inject headers; the original mock doesn't
		// So verify the mock was called with the same function reference
		expect(globalThis.fetch).not.toBe(wrappedFetch);
	});

	it('passes through when inspector is disabled', async () => {
		const { installClientFetchInterceptor } = await import('../client/fetchInterceptor');

		isInspectorEnabled.set(false);

		const fakeResponse = new Response('ok');
		let wasCalledWithInit = false;
		globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
			wasCalledWithInit = !!init?.headers;
			return fakeResponse;
		});

		const uninstall = installClientFetchInterceptor();

		await globalThis.fetch('/api/users');

		// When disabled, the interceptor should not inject headers
		// It should pass through directly to original fetch
		expect(wasCalledWithInit).toBe(false);

		uninstall();
	});
});
