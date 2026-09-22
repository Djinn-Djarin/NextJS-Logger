// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { terminalStore, isInspectorEnabled, unreadErrorCount, markErrorsRead, getSavedRecordsLimit, setSavedRecordsLimit, type LogEntry } from '../client/store';

beforeEach(() => {
	terminalStore.clear();
	markErrorsRead();
	localStorage.clear();
});

describe('Workflow: client log store', () => {
	it('addLog appends entry to store', () => {
		terminalStore.addLog('test message', 'info');

		const logs = terminalStore.getSnapshot();
		expect(logs).toHaveLength(1);
		expect(logs[0].message).toBe('test message');
		expect(logs[0].type).toBe('info');
		expect(logs[0].timestamp).toBeTruthy();
	});

	it('addLog includes meta fields', () => {
		terminalStore.addLog('[API] GET /api/users', 'success', undefined, {
			tag: 'api',
			method: 'GET',
			url: '/api/users',
			status: 200,
			duration_ms: 45,
			initiator: 'src/app/page.tsx:30'
		});

		const log = terminalStore.getSnapshot()[0];
		expect(log.tag).toBe('api');
		expect(log.method).toBe('GET');
		expect(log.url).toBe('/api/users');
		expect(log.status).toBe(200);
		expect(log.duration_ms).toBe(45);
		expect(log.initiator).toBe('src/app/page.tsx:30');
	});

	it('addLog respects records limit', () => {
		setSavedRecordsLimit(5);

		for (let i = 0; i < 10; i++) {
			terminalStore.addLog(`msg ${i}`, 'info');
		}

		const logs = terminalStore.getSnapshot();
		expect(logs.length).toBeLessThanOrEqual(5);
		expect(logs[0].message).toBe('msg 5');
	});

	it('addLog increments unreadErrorCount for error type', () => {
		expect(unreadErrorCount.getSnapshot()).toBe(0);

		terminalStore.addLog('error occurred', 'error');
		expect(unreadErrorCount.getSnapshot()).toBe(1);

		terminalStore.addLog('another error', 'error');
		expect(unreadErrorCount.getSnapshot()).toBe(2);
	});

	it('addLog does not increment unreadErrorCount for non-errors', () => {
		terminalStore.addLog('info message', 'info');
		expect(unreadErrorCount.getSnapshot()).toBe(0);
	});

	it('clear resets store and unreadErrorCount', () => {
		terminalStore.addLog('msg 1', 'info');
		terminalStore.addLog('error', 'error');
		expect(terminalStore.getSnapshot()).toHaveLength(2);

		terminalStore.clear();

		expect(terminalStore.getSnapshot()).toHaveLength(0);
		expect(unreadErrorCount.getSnapshot()).toBe(0);
	});

	it('subscribe notifies on new entries', () => {
		const listener = vi.fn();
		const unsub = terminalStore.subscribe(listener);

		terminalStore.addLog('new entry', 'info');
		expect(listener).toHaveBeenCalled();

		unsub();
	});

	it('unsubscribe stops notifications', () => {
		const listener = vi.fn();
		const unsub = terminalStore.subscribe(listener);
		unsub();

		terminalStore.addLog('new entry', 'info');
		expect(listener).not.toHaveBeenCalled();
	});

	it('markErrorsRead resets unreadErrorCount', () => {
		terminalStore.addLog('error 1', 'error');
		terminalStore.addLog('error 2', 'error');
		expect(unreadErrorCount.getSnapshot()).toBe(2);

		markErrorsRead();
		expect(unreadErrorCount.getSnapshot()).toBe(0);
	});

	it('isInspectorEnabled defaults to true', () => {
		expect(isInspectorEnabled.getSnapshot()).toBe(true);
	});

	it('isInspectorEnabled can be toggled', () => {
		isInspectorEnabled.set(false);
		expect(isInspectorEnabled.getSnapshot()).toBe(false);

		isInspectorEnabled.set(true);
		expect(isInspectorEnabled.getSnapshot()).toBe(true);
	});
});

describe('savedRecordsLimit', () => {
	it('defaults to 50', () => {
		localStorage.clear();
		expect(getSavedRecordsLimit()).toBe(50);
	});

	it('persists via localStorage', () => {
		setSavedRecordsLimit(25);
		expect(getSavedRecordsLimit()).toBe(25);
	});

	it('ignores invalid localStorage values', () => {
		localStorage.setItem('li-saved-limit', 'abc');
		expect(getSavedRecordsLimit()).toBe(50);
	});

	it('ignores zero/negative values', () => {
		localStorage.setItem('li-saved-limit', '0');
		expect(getSavedRecordsLimit()).toBe(50);
		localStorage.setItem('li-saved-limit', '-5');
		expect(getSavedRecordsLimit()).toBe(50);
	});
});
