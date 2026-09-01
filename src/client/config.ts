export interface ClientConfig {
	/** Base path of the generated inspector routes (default `/api/log-inspector`). */
	basePath: string;
	/** localStorage key used to persist the last few logs. */
	storageKey: string;
	/** Keep client logs in localStorage across reloads. */
	persist: boolean;
}

const defaults: ClientConfig = {
	basePath: '/api/log-inspector',
	storageKey: 'nextjs_log_inspector_logs',
	persist: true
};

export const clientConfig: ClientConfig = { ...defaults };

export function configureClient(cfg: Partial<ClientConfig>): void {
	Object.assign(clientConfig, cfg);
}

export function resetClientConfig(): void {
	Object.assign(clientConfig, defaults);
}

export function getEffectiveBasePath(): string {
	let rawBase = '';
	if (typeof process !== 'undefined' && process.env && process.env.NEXT_PUBLIC_BASE_PATH) {
		rawBase = process.env.NEXT_PUBLIC_BASE_PATH;
	} else if (typeof window !== 'undefined' && window.location.pathname) {
		const routeName = clientConfig.basePath.replace(/^\/+|\/+$/g, '');
		const parts = window.location.pathname.split('/').filter(Boolean);
		if (parts.length > 0 && parts[0] !== routeName) {
			rawBase = parts[0];
		}
	}

	const appBase = rawBase.replace(/^\/+|\/+$/g, '');
	const routeBase = clientConfig.basePath.replace(/^\/+|\/+$/g, '');

	if (appBase && !routeBase.startsWith(appBase)) {
		return `/${appBase}/${routeBase}`;
	}
	return `/${routeBase}`;
}