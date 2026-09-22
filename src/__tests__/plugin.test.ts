// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdirSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';

const TEMP_ROOT = join(process.cwd(), '__test_temp__');

beforeEach(() => {
	if (existsSync(TEMP_ROOT)) rmSync(TEMP_ROOT, { recursive: true });
	mkdirSync(TEMP_ROOT, { recursive: true });
	mkdirSync(join(TEMP_ROOT, 'src', 'app'), { recursive: true });
});

afterEach(() => {
	if (existsSync(TEMP_ROOT)) rmSync(TEMP_ROOT, { recursive: true });
});

describe('Workflow: plugin route generation', () => {
	it('generates stream and clear route handlers', async () => {
		const originalCwd = process.cwd;
		process.cwd = () => TEMP_ROOT;

		try {
			const { withLogInspector } = await import('../plugin/index');
			withLogInspector()({});

			const streamRoute = join(TEMP_ROOT, 'src', 'app', 'api', 'log-inspector', 'stream', 'route.ts');
			const clearRoute = join(TEMP_ROOT, 'src', 'app', 'api', 'log-inspector', 'clear', 'route.ts');

			expect(existsSync(streamRoute)).toBe(true);
			expect(existsSync(clearRoute)).toBe(true);

			const streamContent = readFileSync(streamRoute, 'utf8');
			expect(streamContent).toContain('streamHandler');
			expect(streamContent).toContain("runtime = 'nodejs'");
			expect(streamContent).toContain('GET');

			const clearContent = readFileSync(clearRoute, 'utf8');
			expect(clearContent).toContain('clearHandler');
			expect(clearContent).toContain('POST');
		} finally {
			process.cwd = originalCwd;
		}
	});

	it('generates instrumentation.ts with installServerCapture', async () => {
		const originalCwd = process.cwd;
		process.cwd = () => TEMP_ROOT;

		try {
			const { withLogInspector } = await import('../plugin/index');
			withLogInspector()({});

			const instrumentationFile = join(TEMP_ROOT, 'src', 'instrumentation.ts');
			expect(existsSync(instrumentationFile)).toBe(true);

			const content = readFileSync(instrumentationFile, 'utf8');
			expect(content).toContain('installServerCapture');
			expect(content).toContain('export async function register');
		} finally {
			process.cwd = originalCwd;
		}
	});

	it('is idempotent — calling twice does not overwrite files', async () => {
		const originalCwd = process.cwd;
		process.cwd = () => TEMP_ROOT;

		try {
			const { withLogInspector } = await import('../plugin/index');
			withLogInspector()({});

			const streamRoute = join(TEMP_ROOT, 'src', 'app', 'api', 'log-inspector', 'stream', 'route.ts');
			const firstContent = readFileSync(streamRoute, 'utf8');

			// Add a marker to detect overwrite
			const marker = '// custom-marker\n';
			const { writeFileSync } = await import('fs');
			writeFileSync(streamRoute, marker + firstContent, 'utf8');

			withLogInspector()({});

			const secondContent = readFileSync(streamRoute, 'utf8');
			expect(secondContent).toContain('// custom-marker');
		} finally {
			process.cwd = originalCwd;
		}
	});

	it('skips generation in production mode', async () => {
		const originalCwd = process.cwd;
		const originalEnv = process.env.NODE_ENV;
		process.cwd = () => TEMP_ROOT;
		process.env.NODE_ENV = 'production';

		try {
			const { withLogInspector } = await import('../plugin/index');
			const result = withLogInspector()({ someConfig: true });

			const streamRoute = join(TEMP_ROOT, 'src', 'app', 'api', 'log-inspector', 'stream', 'route.ts');
			expect(existsSync(streamRoute)).toBe(false);
			expect(result).toEqual({ someConfig: true });
		} finally {
			process.cwd = originalCwd;
			process.env.NODE_ENV = originalEnv;
		}
	});

	it('respects custom basePath option', async () => {
		const originalCwd = process.cwd;
		process.cwd = () => TEMP_ROOT;

		try {
			const { withLogInspector } = await import('../plugin/index');
			withLogInspector({ basePath: 'custom/routes' })({});

			const streamRoute = join(TEMP_ROOT, 'src', 'app', 'custom', 'routes', 'stream', 'route.ts');
			expect(existsSync(streamRoute)).toBe(true);
		} finally {
			process.cwd = originalCwd;
		}
	});

	it('skips instrumentation when autoCreateInstrumentation is false', async () => {
		const originalCwd = process.cwd;
		process.cwd = () => TEMP_ROOT;

		try {
			const { withLogInspector } = await import('../plugin/index');
			withLogInspector({ autoCreateInstrumentation: false })({});

			const instrumentationFile = join(TEMP_ROOT, 'src', 'instrumentation.ts');
			expect(existsSync(instrumentationFile)).toBe(false);

			// Routes should still be generated
			const streamRoute = join(TEMP_ROOT, 'src', 'app', 'api', 'log-inspector', 'stream', 'route.ts');
			expect(existsSync(streamRoute)).toBe(true);
		} finally {
			process.cwd = originalCwd;
		}
	});
});
