// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { terminalStore } from '../client/store';

beforeEach(() => {
	terminalStore.clear();
});

describe('Workflow: IndexedDB interception', () => {
	it('intercepts indexedDB.open and deleteDatabase, logging both to store', async () => {
		// Mock indexedDB
		const mockOpen = vi.fn().mockReturnValue({
			onsuccess: null,
			onerror: null,
			createObjectStore: vi.fn(),
			result: {}
		});
		const mockDelete = vi.fn();

		Object.defineProperty(window, 'indexedDB', {
			value: {
				open: mockOpen,
				deleteDatabase: mockDelete,
				databases: vi.fn().mockResolvedValue([])
			},
			writable: true,
			configurable: true
		});

		const { installIdbInterceptor } = await import('../client/idbInterceptor');
		const uninstall = installIdbInterceptor();

		// Test open
		window.indexedDB.open('mydb', 2);
		await new Promise((r) => setTimeout(r, 100));

		const logsAfterOpen = terminalStore.getSnapshot();
		const openEntry = logsAfterOpen.find((l) => l.url?.includes('mydb'));
		expect(openEntry).toBeTruthy();
		expect(openEntry!.tag).toBe('indexeddb');
		expect(openEntry!.method).toBe('OPEN');
		expect(openEntry!.url).toBe('mydb');

		// Test deleteDatabase
		window.indexedDB.deleteDatabase('mydb2');
		await new Promise((r) => setTimeout(r, 100));

		const logsAfterDelete = terminalStore.getSnapshot();
		const deleteEntry = logsAfterDelete.find((l) => l.url?.includes('mydb2'));
		expect(deleteEntry).toBeTruthy();
		expect(deleteEntry!.tag).toBe('indexeddb');
		expect(deleteEntry!.method).toBe('DELETE');

		uninstall();
	});
});
