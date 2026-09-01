import { existsSync, writeFileSync, readFileSync, mkdirSync } from 'fs';
import { join } from 'path';

export interface NextLogInspectorCaptureOptions {
	/** URL prefixes that must NOT be logged (defaults to the inspector's own endpoints + `/_next/*`). */
	skipPaths?: string[];
	/** Only requests under this prefix are logged. Default `/api/`. */
	apiPrefix?: string;
	/** Also log non-API (page) requests. */
	logPages?: boolean;
	/** Rewrite 4xx/5xx HTML responses to structured JSON (never HTML). Default true. */
	errorToJson?: boolean;
}

export interface NextLogInspectorPluginOptions {
	/** Route prefix under `app` (no leading/trailing slashes). Default `api/log-inspector`. */
	basePath?: string;
	/** Path to the App Router directory, relative to the project root. Default `app` (or `src/app`). */
	appDir?: string;
	/** Generate `instrumentation.ts` when missing so server capture is wired automatically. Default true. */
	autoCreateInstrumentation?: boolean;
	/** Options forwarded to the generated `installServerCapture()` call. */
	capture?: NextLogInspectorCaptureOptions;
}

const PKG = 'nextjs-log-inspector';

function writeIfMissing(file: string, content: string, log: (msg: string) => void): void {
	if (existsSync(file)) return;
	writeFileSync(file, content, 'utf8');
	log(`generated ${file.replace(process.cwd(), '.')}`);
}

function pickAppDir(root: string): string {
	const srcApp = join(root, 'src', 'app');
	return existsSync(srcApp) ? 'src/app' : 'app';
}

function pickInstrumentationFile(root: string): string {
	if (existsSync(join(root, 'src', 'instrumentation.ts'))) return join(root, 'src', 'instrumentation.ts');
	if (existsSync(join(root, 'instrumentation.ts'))) return join(root, 'instrumentation.ts');
	return existsSync(join(root, 'src')) ? join(root, 'src', 'instrumentation.ts') : join(root, 'instrumentation.ts');
}

/**
 * Zero-code Next.js wiring for the log inspector:
 *  - generates the SSE stream + clear route handlers under `{appDir}/{basePath}/`
 *  - creates `instrumentation.ts` (if missing) so every `/api/*` call and
 *    server-side fetch is captured automatically
 *
 * Wrap your next config:
 *
 *   // next.config.mjs
 *   import { withLogInspector } from 'nextjs-log-inspector/plugin';
 *   export default withLogInspector()({ /* your config *\/ });
 *
 * The `LogInspector` component is NOT auto-mounted — add it yourself to your
 * root layout:
 *
 *   import { LogInspector } from 'nextjs-log-inspector/components';
 *
 *   export default function RootLayout({ children }) {
 *     return <html><body>{children}<LogInspector /></body></html>;
 *   }
 */
export function withLogInspector(options: NextLogInspectorPluginOptions = {}) {
	const basePath = (options.basePath ?? 'api/log-inspector').replace(/^\/+|\/+$/g, '');
	const root = process.cwd();

	const captureOpts = options.capture ?? {};

	function ensureRoutes(log: (msg: string) => void) {
		const appDir = join(root, options.appDir ?? pickAppDir(root));
		const baseDir = join(appDir, basePath);
		mkdirSync(join(baseDir, 'stream'), { recursive: true });
		mkdirSync(join(baseDir, 'clear'), { recursive: true });

		writeIfMissing(
			join(baseDir, 'stream', 'route.ts'),
			`import { streamHandler } from '${PKG}/server';\n\nexport const runtime = 'nodejs';\nexport const dynamic = 'force-dynamic';\nexport const GET = streamHandler();\n`,
			log
		);
		writeIfMissing(
			join(baseDir, 'clear', 'route.ts'),
			`import { clearHandler } from '${PKG}/server';\n\nexport const runtime = 'nodejs';\nexport const POST = clearHandler;\n`,
			log
		);
	}

	function ensureInstrumentation(log: (msg: string) => void, warn: (msg: string) => void) {
		const file = pickInstrumentationFile(root);
		if (existsSync(file)) {
			const existing = readFileSync(file, 'utf8');
			if (!existing.includes(PKG)) {
				warn(
					`[log-inspector] ${file.replace(root, '.')} already exists and is not composed with ${PKG}. ` +
						`Wire it up manually once:\n` +
						`  import { installServerCapture } from 'nextjs-log-inspector/server';\n` +
						`  export async function register() {\n` +
						`    installServerCapture();\n` +
						`  }`
				);
			}
			return;
		}

		const opts = JSON.stringify(captureOpts);
		const content = [
			`import { installServerCapture } from 'nextjs-log-inspector/server';`,
			'',
			`export async function register() {`,
			`  installServerCapture(${opts});`,
			`}`,
			''
		].join('\n');
		writeFileSync(file, content, 'utf8');
		log(`[log-inspector] generated ${file.replace(root, '.')}`);
	}

	function apply(config: unknown) {
		const log = (msg: string) => console.log(`[log-inspector] ${msg}`);
		const warn = (msg: string) => console.warn(msg);
		ensureRoutes(log);
		if (options.autoCreateInstrumentation !== false) ensureInstrumentation(log, warn);
		return config;
	}

	/**
	 * Accepts either a plain next config object or a `(phase, { defaultConfig })`
	 * function (the form Next.js itself supports) and returns the same shape.
	 */
	return <T = unknown>(config?: T): T => {
		if (typeof config === 'function') {
			const fn = config as unknown as (phase: string, args: { defaultConfig: Record<string, unknown> }) => Record<string, unknown>;
			return ((phase: string, args: { defaultConfig: Record<string, unknown> }) => apply(fn(phase, args))) as unknown as T;
		}
		return apply(config) as T;
	};
}

export default withLogInspector;