import { captureInitiator } from './captureInitiator';

let installed = false;

export function installIdbInterceptor(): () => void {
	if (typeof window === 'undefined' || !window.indexedDB) return () => {};
	if (installed) return () => {};
	installed = true;

	const originalOpen = window.indexedDB.open;
	const originalDelete = window.indexedDB.deleteDatabase;

	window.indexedDB.open = function (name: string, version?: number) {
		const initiator = captureInitiator() || 'IDB.open';
		import('./store').then(({ terminalStore }) => {
			terminalStore.addLog(`[IDB] Open Database: ${name} (v${version || 1})`, 'info', undefined, {
				tag: 'indexeddb',
				initiator,
				method: 'OPEN',
				url: name
			});
		});
		return originalOpen.call(this, name, version);
	};

	window.indexedDB.deleteDatabase = function (name: string) {
		const initiator = captureInitiator() || 'IDB.deleteDatabase';
		import('./store').then(({ terminalStore }) => {
			terminalStore.addLog(`[IDB] Delete Database: ${name}`, 'info', undefined, {
				tag: 'indexeddb',
				initiator,
				method: 'DELETE',
				url: name
			});
		});
		return originalDelete.call(this, name);
	};

	if (typeof IDBObjectStore !== 'undefined') {
		const originalPut = IDBObjectStore.prototype.put;
		const originalAdd = IDBObjectStore.prototype.add;
		const originalDelete = IDBObjectStore.prototype.delete;
		const originalClear = IDBObjectStore.prototype.clear;

		IDBObjectStore.prototype.put = function (value: any, key?: IDBValidKey) {
			const initiator = captureInitiator() || 'IDB.put';
			const storeName = this.name;
			import('./store').then(({ terminalStore }) => {
				const details = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
				terminalStore.addLog(`[IDB] Put -> ${storeName}`, 'info', details, {
					tag: 'indexeddb',
					initiator,
					method: 'PUT',
					url: storeName
				});
			});
			return originalPut.call(this, value, key);
		};

		IDBObjectStore.prototype.add = function (value: any, key?: IDBValidKey) {
			const initiator = captureInitiator() || 'IDB.add';
			const storeName = this.name;
			import('./store').then(({ terminalStore }) => {
				const details = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
				terminalStore.addLog(`[IDB] Add -> ${storeName}`, 'info', details, {
					tag: 'indexeddb',
					initiator,
					method: 'ADD',
					url: storeName
				});
			});
			return originalAdd.call(this, value, key);
		};

		IDBObjectStore.prototype.delete = function (key: IDBValidKey | IDBKeyRange) {
			const initiator = captureInitiator() || 'IDB.delete';
			const storeName = this.name;
			import('./store').then(({ terminalStore }) => {
				terminalStore.addLog(`[IDB] Delete -> ${storeName} (key: ${String(key)})`, 'info', undefined, {
					tag: 'indexeddb',
					initiator,
					method: 'DELETE',
					url: storeName
				});
			});
			return originalDelete.call(this, key);
		};

		IDBObjectStore.prototype.clear = function () {
			const initiator = captureInitiator() || 'IDB.clear';
			const storeName = this.name;
			import('./store').then(({ terminalStore }) => {
				terminalStore.addLog(`[IDB] Clear -> ${storeName}`, 'info', undefined, {
					tag: 'indexeddb',
					initiator,
					method: 'CLEAR',
					url: storeName
				});
			});
			return originalClear.call(this);
		};
	}

	return () => {
		// Cleanup omitted for brevity/safety; usually left attached globally
	};
}
