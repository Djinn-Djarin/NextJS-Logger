// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getStoreState, clearLogs } from '../server/logStore';

beforeEach(() => {
	clearLogs();
	getStoreState().seq = 0;
});

describe('Workflow: server console capture', () => {
	it('console.log is intercepted and piped to log store', async () => {
		const { installServerConsoleInterceptor } = await import('../server/consoleInterceptor');
		installServerConsoleInterceptor();

		// The interceptor wraps console.log to call pushLog.
		// We call console.log — the patched version runs and pushes to the store.
		console.log('DB connected successfully');

		const logs = getStoreState().logs;
		const entry = logs.find((l) => l.url.includes('DB connected'));
		expect(entry).toBeTruthy();
		expect(entry!.url).toContain('[Server Console]');
		expect(entry!.url).toContain('DB connected successfully');
		expect(entry!.method).toBe('-');
		expect(entry!.success).toBe(true);
	});

	it('console.error is intercepted and marked as unsuccessful', async () => {
		const { installServerConsoleInterceptor } = await import('../server/consoleInterceptor');
		installServerConsoleInterceptor();

		console.error('Query failed');

		const logs = getStoreState().logs;
		const entry = logs.find((l) => l.url.includes('Query failed'));
		expect(entry).toBeTruthy();
		expect(entry!.success).toBe(false);
		expect(entry!.error).toBe('error');
	});

	it('strips ANSI color codes from logged messages', async () => {
		const { installServerConsoleInterceptor } = await import('../server/consoleInterceptor');
		installServerConsoleInterceptor();

		console.log('\x1b[31mred text\x1b[0m');

		const logs = getStoreState().logs;
		const entry = logs.find((l) => l.url.includes('red text'));
		expect(entry).toBeTruthy();
		expect(entry!.url).not.toContain('\x1b[');
		expect(entry!.url).toContain('red text');
	});

	it('inspectLog sends directly without printing to native console', async () => {
		const { inspectLog } = await import('../server/consoleInterceptor');

		inspectLog('manual inspection', 'warn', { key: 'value' });

		const logs = getStoreState().logs;
		const entry = logs.find((l) => l.url.includes('manual inspection'));
		expect(entry).toBeTruthy();
		expect(entry!.url).toContain('[Server Inspect]');
		expect(entry!.success).toBe(true);
	});

	it('is idempotent — installing twice does not double-patch', async () => {
		const { installServerConsoleInterceptor } = await import('../server/consoleInterceptor');
		installServerConsoleInterceptor();
		installServerConsoleInterceptor();

		console.log('unique-test-message-123');

		const logs = getStoreState().logs;
		const matching = logs.filter((l) => l.url.includes('unique-test-message-123'));
		expect(matching).toHaveLength(1);
	});
});
