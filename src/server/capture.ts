import { pushLog, capBody, MAX_BODY_CHARS } from './logStore';
import { installServerFetchInterceptor } from './fetchInterceptor';

declare const __non_webpack_require__: ((id: string) => any) | undefined;

export interface CaptureOptions {
	/** URL prefixes that must NOT be logged (the inspector's own endpoints + Next internals). */
	skipPaths?: string[];
	/** Only requests under this prefix are logged. */
	apiPrefix?: string;
	/** Also log non-API (page) requests. */
	logPages?: boolean;
	/** Whether to log outbound fetch calls. */
	shouldLogFetch?: (input: RequestInfo | URL, init?: RequestInit) => boolean;
	/** Rewrite 4xx/5xx HTML responses to structured JSON (never HTML). */
	errorToJson?: boolean;
}

const GLOBAL_FLAG = '__nextLogInspectorCaptureInstalled';

const DEFAULT_SKIP_PATHS = ['/_next/', '/api/log-inspector', '/favicon.ico', '/.well-known/'];

function requestUrl(raw: string): { path: string } {
	if (!raw) return { path: '/' };
	if (/^https?:\/\//i.test(raw)) {
		try {
			const u = new URL(raw);
			return { path: u.pathname + u.search };
		} catch {
			/* fall through */
		}
	}
	return { path: raw };
}

function tryParse(text: string): unknown {
	if (!text) return undefined;
	try {
		return JSON.parse(text);
	} catch {
		return text;
	}
}

function isBinaryContent(text: string): boolean {
	if (!text || text.length < 2) return false;
	const first4 = text.charCodeAt(0) * 256 + text.charCodeAt(1);
	// gzip magic: 0x1f8b
	if (first4 === 0x1f8b) return true;
	// zlib/deflate: 0x7801, 0x789c, 0x78da
	if (first4 === 0x7801 || first4 === 0x789c || first4 === 0x78da) return true;
	// brotli starts with common compressed byte ranges
	if (text.length > 10 && /[\x00-\x08\x0e-\x1f]/.test(text.slice(0, 20))) return true;
	return false;
}

function stripHtml(raw: string, fallback: string): string {
	if (/<!doctype|<html/i.test(raw)) return fallback;
	return raw;
}

function buildErrorJson(status: number, body: string, meta: { path: string; method: string }): unknown {
	let errorMsg = status === 404 ? `Endpoint not found: ${meta.path}` : 'Internal Server Error';
	let detailMsg: string | undefined;
	const parsed = tryParse(body);
	if (parsed && typeof parsed === 'object' && parsed !== null) {
		const rb = parsed as Record<string, unknown>;
		if (typeof rb.error === 'string') errorMsg = rb.error;
		else if (typeof rb.message === 'string') errorMsg = rb.message;
		else if (typeof rb.detail === 'string') errorMsg = rb.detail;
		if (typeof rb.detail === 'string') detailMsg = rb.detail;
		else if (typeof rb.message === 'string' && rb.message !== errorMsg) detailMsg = rb.message;
	} else if (typeof body === 'string' && body.trim()) {
		errorMsg = stripHtml(body.trim(), status === 404 ? `Endpoint not found: ${meta.path}` : `Server error (${status}) on ${meta.path}`);
	}
	if (typeof errorMsg === 'string' && /<!doctype|<html/i.test(errorMsg)) {
		errorMsg = status === 404 ? `Endpoint not found: ${meta.path}` : `Server error (${status}) on ${meta.path}`;
	}
	return {
		success: false,
		status,
		error: errorMsg,
		path: meta.path,
		method: meta.method,
		detail: detailMsg || undefined
	};
}

interface CaptureMeta {
	url: string;
	method: string;
	initiator: string;
	t0: number;
	getRequestText: () => string;
}

/**
 * Observe the request body without consuming it. Patching `req.emit` lets us
 * watch `data` events while Node's normal listeners still receive them, so
 * Next.js' own body parsing is never disturbed.
 */
function observeRequestBody(req: NodeJS.ReadableStream): () => string {
	let chunks: Buffer[] = [];
	let total = 0;
	const origEmit = (req as any).emit.bind(req) as (event: string, ...args: any[]) => boolean;
	(req as any).emit = function (event: string, ...args: any[]): boolean {
		if (event === 'data') {
			const chunk = args[0];
			if (chunk !== undefined && chunk !== null) {
				const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
				if (total < MAX_BODY_CHARS) {
					const remaining = MAX_BODY_CHARS - total;
					chunks.push(buf.subarray(0, remaining));
					total += Math.min(buf.length, remaining);
				}
			}
		}
		return origEmit.apply(req, [event, ...args]);
	};
	return () => Buffer.concat(chunks).toString('utf8');
}

function captureResponse(res: any, meta: CaptureMeta, opts: CaptureOptions) {
	const origWriteHead = res.writeHead?.bind(res);
	const origWrite = res.write?.bind(res);
	const origEnd = res.end?.bind(res);

	let status = typeof res.statusCode === 'number' ? res.statusCode : 200;
	let contentType: string | undefined =
		typeof res.getHeader === 'function' ? (res.getHeader('content-type') as string | undefined) : undefined;
	let contentEncoding: string | undefined =
		typeof res.getHeader === 'function' ? (res.getHeader('content-encoding') as string | undefined) : undefined;
	let rewriting = false;
	let captured: Buffer[] = [];
	let capturedLen = 0;
	let done = false;

	const isCompressedResponse = () => /\b(gzip|br|deflate|zstd|compress)\b/i.test(contentEncoding || '');

	const cap = (chunk: any) => {
		if (isCompressedResponse()) return;
		if (capturedLen >= MAX_BODY_CHARS) return;
		const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
		const remaining = MAX_BODY_CHARS - capturedLen;
		captured.push(buf.subarray(0, remaining));
		capturedLen += Math.min(buf.length, remaining);
	};

	const maybeStartRewrite = (s: number) => {
		if (rewriting || done) return;
		if (isCompressedResponse()) return;
		const ct = typeof res.getHeader === 'function' ? (res.getHeader('content-type') as string | undefined) : contentType;
		if (opts.errorToJson !== false && s >= 400 && ct && ct.toLowerCase().includes('html')) {
			rewriting = true;
		}
	};

	if (origWriteHead) {
		res.writeHead = function (statusCode: number, ...rest: any[]) {
			status = statusCode;
			if (rest.length >= 2 && typeof rest[0] === 'string') {
				const h = rest[1];
				if (h && typeof h['content-type'] === 'string') contentType = h['content-type'];
				if (h && typeof h['content-encoding'] === 'string') contentEncoding = h['content-encoding'];
			} else if (rest.length >= 1 && typeof rest[0] === 'object' && rest[0] !== null) {
				const h = rest[0];
				if (typeof h['content-type'] === 'string') contentType = h['content-type'];
				if (typeof h['content-encoding'] === 'string') contentEncoding = h['content-encoding'];
			}
			maybeStartRewrite(status);
			if (rewriting) return res; // delay headers until we can rewrite the body
			return origWriteHead(statusCode, ...rest);
		};
	}

	const origSetHeader = res.setHeader?.bind(res);
	if (origSetHeader) {
		res.setHeader = function (name: string, value: string | string[]) {
			if (typeof name === 'string') {
				const lower = name.toLowerCase();
				if (lower === 'content-type') contentType = Array.isArray(value) ? value[0] : value;
				if (lower === 'content-encoding') contentEncoding = Array.isArray(value) ? value[0] : value;
			}
			return origSetHeader(name, value);
		};
	}

	if (origWrite) {
		res.write = function (chunk: any, ...rest: any[]) {
			if (done) return origWrite(chunk, ...rest);
			if (rewriting) {
				cap(chunk);
				return true;
			}
			cap(chunk);
			return origWrite(chunk, ...rest);
		};
	}

	if (origEnd) {
		res.end = function (chunk?: any, ...rest: any[]) {
			if (done) return origEnd(chunk, ...rest);
			done = true;
			if (chunk) cap(chunk);

			const finalStatus = typeof res.statusCode === 'number' && res.statusCode !== 200 ? res.statusCode : status || 200;
			maybeStartRewrite(finalStatus);

			const finish = (bodyText: string) => {
				const duration_ms = Math.round(performance.now() - meta.t0);
				const cacheHeader = (typeof res.getHeader === 'function' ? (res.getHeader('x-nextjs-cache') || res.getHeader('x-cache')) : '') || '';
				const isCacheHit = duration_ms <= 1 || /hit/i.test(String(cacheHeader));
				const compressed = isCompressedResponse() || isBinaryContent(bodyText);
				pushLog({
					method: meta.method,
					url: meta.url,
					success: finalStatus < 400,
					status: finalStatus,
					duration_ms,
					initiator: meta.initiator || undefined,
					request_body: capBody(meta.getRequestText() ? tryParse(meta.getRequestText()) : undefined),
					response_body: capBody(compressed ? `[Compressed: ${contentEncoding || 'binary'}]` : bodyText ? tryParse(bodyText) : undefined),
					cached: isCacheHit
				});
			};

			if (rewriting) {
				try {
					const body = Buffer.concat(captured).toString('utf8');
					const json = buildErrorJson(finalStatus, body, { path: meta.url, method: meta.method });
					try {
						res.removeHeader('content-encoding');
					} catch {
						/* ignore */
					}
					try {
						res.removeHeader('content-length');
					} catch {
						/* ignore */
					}
					try {
						res.setHeader('content-type', 'application/json; charset=utf-8');
					} catch {
						/* ignore */
					}
					res.writeHead(finalStatus);
					const out = JSON.stringify(json);
					res.end(out);
					finish(out);
					return res;
				} catch {
					// Fall back to forwarding the original response untouched.
					return origEnd(chunk, ...rest);
				}
			}

			const body = Buffer.concat(captured).toString('utf8');
			finish(body);
			if (chunk !== undefined) return origEnd(chunk, ...rest);
			return origEnd();
		};
	}
}

function captureRequest(req: any, res: any, opts: CaptureOptions) {
	if (opts.skipPaths?.some((p) => req.url.startsWith(p))) return;

	const { path } = requestUrl(req.url);
	if (opts.skipPaths?.some((p) => path.startsWith(p))) return;

	const isApi = path.includes('/api/') || path.startsWith(opts.apiPrefix || '/api/');
	if (!isApi && !opts.logPages) return;

	const method = (req.method || 'GET').toUpperCase();
	const meta: CaptureMeta = {
		url: path,
		method,
		initiator: req.headers?.['x-initiator'] || '',
		t0: performance.now(),
		getRequestText: () => ''
	};

	if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
		try {
			meta.getRequestText = observeRequestBody(req);
		} catch {
			/* body not readable */
		}
	}

	captureResponse(res, meta, opts);
}

/**
 * Zero-code server wiring for Next.js, installed from `instrumentation.ts`
 * (`register()`). It:
 *   1. wraps the server-side global `fetch` so every outbound call is captured,
 *   2. patches the Node http server so every incoming `/api/*` request is
 *      captured with method, url, status, duration, initiator and bodies.
 *
 * The inspector's own routes and Next internals (`/_next/*`) are never logged.
 */
function getHttpModule(): typeof import('http') | null {
	try {
		if (typeof __non_webpack_require__ === 'function') {
			return __non_webpack_require__('http');
		}
		const getReq = Function('return typeof require !== "undefined" ? require : null');
		const req = getReq();
		if (req) return req('http');
	} catch {
		/* ignore */
	}
	return null;
}

export function installServerCapture(options: CaptureOptions = {}): () => void {
	if (process.env.NODE_ENV === 'production') return () => {};

	const uninstallFetch = installServerFetchInterceptor({
		shouldLog: options.shouldLogFetch
	});

	const opts: CaptureOptions = {
		skipPaths: options.skipPaths ?? DEFAULT_SKIP_PATHS,
		apiPrefix: options.apiPrefix ?? '/api/',
		logPages: options.logPages ?? false,
		errorToJson: options.errorToJson ?? true
	};

	const g = globalThis as unknown as { [GLOBAL_FLAG]?: boolean };
	if (g[GLOBAL_FLAG]) return uninstallFetch;
	g[GLOBAL_FLAG] = true;

	let uninstalled = false;
	let originalEmit: ((event: string, ...args: any[]) => boolean) | null = null;

	try {
		// Lazy import so this file can also be loaded in browser-free contexts.
		const http = getHttpModule();
		if (!http || !http.Server) return uninstallFetch;
		const proto = http.Server.prototype as any;
		if (proto.__nextLogInspectorPatched) return uninstallFetch;

		originalEmit = proto.emit;
		proto.__nextLogInspectorPatched = true;
		proto.emit = function (event: string, ...args: any[]) {
			if (event === 'request') {
				try {
					captureRequest(args[0], args[1], opts);
				} catch {
					/* capture must never break the request */
				}
			}
			return originalEmit!.apply(this, [event, ...args]);
		};

		uninstalled = false;
		return () => {
			if (uninstalled) return;
			uninstalled = true;
			if (proto.emit && originalEmit && proto.__nextLogInspectorPatched) {
				proto.emit = originalEmit;
				proto.__nextLogInspectorPatched = false;
			}
			uninstallFetch();
		};
	} catch {
		return uninstallFetch;
	}
}