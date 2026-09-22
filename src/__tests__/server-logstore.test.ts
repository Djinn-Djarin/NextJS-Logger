// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { pushLog, clearLogs, getLogsSince, getLogCount, subscribeLogs, capBody, getStoreState, MAX_LOGS, runWithInitiator, getRequestInitiator } from '../server/logStore';

beforeEach(() => {
	clearLogs();
	const state = getStoreState();
	state.seq = 0;
});

describe('Workflow: server-side service call capture', () => {
	it('records outbound fetch calls with timing, status, and initiator', () => {
		pushLog({
			method: 'GET',
			url: 'https://api.stripe.com/v1/charges',
			success: true,
			status: 200,
			duration_ms: 142,
			initiator: 'fetchCharges (src/app/api/payments/route.ts:12)'
		});

		const logs = getLogsSince(0);
		expect(logs).toHaveLength(1);
		expect(logs[0].url).toBe('https://api.stripe.com/v1/charges');
		expect(logs[0].method).toBe('GET');
		expect(logs[0].status).toBe(200);
		expect(logs[0].success).toBe(true);
		expect(logs[0].duration_ms).toBe(142);
		expect(logs[0].initiator).toContain('route.ts');
		expect(logs[0].id).toBe(1);
		expect(logs[0].timestamp).toBeTruthy();
	});

	it('captures POST requests with parsed request body', () => {
		pushLog({
			method: 'POST',
			url: 'https://db.example.com/query',
			success: true,
			status: 200,
			duration_ms: 87,
			initiator: 'queryDb (src/lib/database.ts:45)',
			request_body: { query: 'SELECT * FROM users', limit: 10 }
		});

		const logs = getLogsSince(0);
		expect(logs[0].request_body).toEqual({ query: 'SELECT * FROM users', limit: 10 });
		expect(logs[0].method).toBe('POST');
	});

	it('captures failed outbound calls with error message', () => {
		pushLog({
			method: 'GET',
			url: 'https://unreachable.service/api',
			success: false,
			status: null,
			duration_ms: 5003,
			error: 'fetch failed',
			initiator: 'callService (src/app/api/route.ts:8)'
		});

		const logs = getLogsSince(0);
		expect(logs[0].success).toBe(false);
		expect(logs[0].status).toBeNull();
		expect(logs[0].error).toBe('fetch failed');
		expect(logs[0].duration_ms).toBe(5003);
	});

	it('assigns incrementing IDs to sequential entries', () => {
		pushLog({ method: 'GET', url: '/api/a', success: true, status: 200, duration_ms: 10 });
		pushLog({ method: 'GET', url: '/api/b', success: true, status: 200, duration_ms: 20 });
		pushLog({ method: 'POST', url: '/api/c', success: true, status: 201, duration_ms: 30 });

		const logs = getLogsSince(0);
		expect(logs[0].id).toBe(1);
		expect(logs[1].id).toBe(2);
		expect(logs[2].id).toBe(3);
	});

	it('notifies subscribers when new entries are pushed', () => {
		const listener = vi.fn();
		const unsub = subscribeLogs(listener);

		pushLog({ method: 'GET', url: '/api/test', success: true, status: 200, duration_ms: 5 });

		expect(listener).toHaveBeenCalledOnce();
		expect(listener).toHaveBeenCalledWith(expect.objectContaining({ url: '/api/test' }));
		unsub();
	});

	it('unsubscribed listener is not called on subsequent pushes', () => {
		const listener = vi.fn();
		const unsub = subscribeLogs(listener);
		unsub();

		pushLog({ method: 'GET', url: '/api/test', success: true, status: 200, duration_ms: 5 });
		expect(listener).not.toHaveBeenCalled();
	});

	it('skips inspector own endpoints via shouldLog filter', () => {
		const shouldLog = (input: RequestInfo | URL) => !String(input).includes('api/log-inspector');

		expect(shouldLog('https://example.com/api/users')).toBe(true);
		expect(shouldLog('https://example.com/api/log-inspector/stream')).toBe(false);
	});

	it('getLogsSince filters by ID (strictly greater than)', () => {
		pushLog({ method: 'GET', url: '/api/1', success: true, status: 200, duration_ms: 1 });
		pushLog({ method: 'GET', url: '/api/2', success: true, status: 200, duration_ms: 2 });
		pushLog({ method: 'GET', url: '/api/3', success: true, status: 200, duration_ms: 3 });

		expect(getLogsSince(0)).toHaveLength(3);
		expect(getLogsSince(1)).toHaveLength(2);
		expect(getLogsSince(2)).toHaveLength(1);
		expect(getLogsSince(3)).toHaveLength(0);
		expect(getLogsSince(10)).toHaveLength(0);
	});

	it('clearLogs empties the store', () => {
		pushLog({ method: 'GET', url: '/api/a', success: true, status: 200, duration_ms: 1 });
		pushLog({ method: 'GET', url: '/api/b', success: true, status: 200, duration_ms: 2 });
		expect(getLogCount()).toBe(2);

		clearLogs();
		expect(getLogCount()).toBe(0);
		expect(getLogsSince(0)).toHaveLength(0);
	});

	it('truncates to MAX_LOGS when store overflows', () => {
		for (let i = 0; i < MAX_LOGS + 10; i++) {
			pushLog({ method: 'GET', url: `/api/${i}`, success: true, status: 200, duration_ms: 1 });
		}
		expect(getLogCount()).toBe(MAX_LOGS);
		const logs = getLogsSince(0);
		expect(logs[0].url).toBe('/api/10');
	});
});

describe('capBody', () => {
	it('returns null/undefined as-is', () => {
		expect(capBody(null)).toBeNull();
		expect(capBody(undefined)).toBeUndefined();
	});

	it('returns short strings unchanged', () => {
		expect(capBody('hello')).toBe('hello');
	});

	it('truncates long strings', () => {
		const long = 'x'.repeat(150_000);
		const result = capBody(long) as string;
		expect(result.length).toBeLessThan(long.length);
		expect(result).toContain('[truncated]');
	});

	it('returns small objects unchanged', () => {
		const obj = { a: 1, b: 'two' };
		expect(capBody(obj)).toEqual(obj);
	});

	it('truncates large serialized objects', () => {
		const big = { data: 'x'.repeat(150_000) };
		const result = capBody(big) as string;
		expect(typeof result).toBe('string');
		expect(result).toContain('[truncated]');
	});

	it('converts non-serializable values to string', () => {
		const sym = Symbol('test');
		const result = capBody(sym) as string;
		expect(typeof result).toBe('string');
	});
});

describe('AsyncLocalStorage initiator tracking', () => {
	it('runs function with initiator and retrieves it', () => {
		runWithInitiator('src/app/api/route.ts:10', () => {
			expect(getRequestInitiator()).toBe('src/app/api/route.ts:10');
		});
	});

	it('returns empty string when no initiator set', () => {
		expect(getRequestInitiator()).toBe('');
	});

	it('treats null/undefined initiator as empty string', () => {
		runWithInitiator(null, () => {
			expect(getRequestInitiator()).toBe('');
		});
		runWithInitiator(undefined, () => {
			expect(getRequestInitiator()).toBe('');
		});
	});
});
