// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { configureClient, resetClientConfig, getEffectiveBasePath, clientConfig } from '../client/config';

beforeEach(() => {
	resetClientConfig();
});

describe('Workflow: client config', () => {
	it('has correct defaults', () => {
		expect(clientConfig.basePath).toBe('/api/log-inspector');
		expect(clientConfig.storageKey).toBe('nextjs_log_inspector_logs');
		expect(clientConfig.persist).toBe(true);
	});

	it('configureClient overrides values', () => {
		configureClient({ persist: false, basePath: '/custom' });
		expect(clientConfig.persist).toBe(false);
		expect(clientConfig.basePath).toBe('/custom');
	});

	it('resetClientConfig restores defaults', () => {
		configureClient({ persist: false });
		resetClientConfig();
		expect(clientConfig.persist).toBe(true);
		expect(clientConfig.basePath).toBe('/api/log-inspector');
	});

	it('getEffectiveBasePath returns default when no env or pathname', () => {
		delete (process.env as any).NEXT_PUBLIC_BASE_PATH;
		expect(getEffectiveBasePath()).toBe('/api/log-inspector');
	});

	it('getEffectiveBasePath uses NEXT_PUBLIC_BASE_PATH when set', () => {
		(process.env as any).NEXT_PUBLIC_BASE_PATH = '/myapp';
		const result = getEffectiveBasePath();
		expect(result).toContain('myapp');
		expect(result).toContain('api/log-inspector');
		delete (process.env as any).NEXT_PUBLIC_BASE_PATH;
	});
});
