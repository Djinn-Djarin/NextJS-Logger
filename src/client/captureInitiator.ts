/**
 * Best-effort name of the calling client module/function with file:line,
 * e.g. `getProjects (src/lib/projectsStore.ts:17)` or
 * `app/page.tsx:30`. Walks the stack, skipping internal frames.
 */
export function captureInitiator(): string {
	try {
		const err = new Error();
		const stack = err.stack || '';
		for (const line of stack.split('\n').slice(1)) {
			const raw = line.trim().replace(/^at\s+/, '');
			if (!raw) continue;
			const paren = raw.match(/\(([^)]+)\)/);
			const loc = paren ? paren[1] : raw;
			const clean = loc.replace(/^file:\/\//, '');
			const m = clean.match(/^(.+?):(\d+):\d+$/);
			if (!m) continue;
			const path = m[1].replace(/\\/g, '/');
			if (
				path.includes('/client/') ||
				path.includes('/node_modules/') ||
				path.startsWith('node:') ||
				path.includes('/.next/') ||
				path.includes('/_next/')
			) {
				continue;
			}
			const fn = paren ? raw.split(' ')[0] ?? '' : '';
			const srcMatch = path.match(/(?:^|\/)((?:src|app)\/.*)$/);
			const file = srcMatch ? srcMatch[1] : path.split('/').slice(-1)[0];
			return fn && fn !== '<anonymous>' ? `${fn} (${file}:${m[2]})` : `${file}:${m[2]}`;
		}
	} catch {
		/* ignore stack capture errors */
	}
	return 'App Client';
}