# nextjs-log-inspector

Zero-code, pluggable request/API logging for Next.js. Drop in the plugin, and every `/api/*` call (and server-side `fetch`) is captured with method, URL, status, duration, request/response bodies and a `file:line` initiator — streamed to an always-on inspector panel in the corner of your app.

## Install

```bash
npm i -D nextjs-log-inspector
```

## Setup

Add the `withLogInspector` wrapper to your `next.config.mjs` / `next.config.ts`:

```js
import { withLogInspector } from 'nextjs-log-inspector/plugin';

export default withLogInspector()({
  // Add package to transpilePackages when linking source or in monorepos
  transpilePackages: ['nextjs-log-inspector'],
  // Next.js basePath (if your app uses a custom base path like '/traccrops')
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || '',
});
```

Then mount the panel in your root `app/layout.tsx`:

```tsx
import { LogInspector } from 'nextjs-log-inspector/components';

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
        <LogInspector />
      </body>
    </html>
  );
}
```

## What gets logged

- **API calls** — any request under `/api/` (configurable `apiPrefix`), including bodies, status, duration and initiator.
- **Server-side fetches & Data Cache** — outgoing server `fetch` calls are intercepted automatically. Next.js Data Cache hits (`force-cache` / `revalidate`) are tagged as `[server cache]` with `0ms` duration.
- **Page requests** — enable `logPages: true` in `installServerCapture({ logPages: true })` to capture full page navigations (e.g. `/sites`).
- **Errors** — 4xx/5xx API responses are rewritten to structured JSON (never HTML) and shown in the panel.
- **Render-loop detection** — if more than 60 log entries arrive in 1000ms (client) or 30 server log entries arrive in 1000ms (server), a `render loop` warning is emitted once per window pointing at the hottest message/endpoint. This catches runaway `useEffect` / `useMemo` reactivity and fetch loops that produce an infinite render loop.

`/__log-inspector/*` requests are never logged.

## Production builds

The library auto-detects `NODE_ENV=production` (set automatically by `npm run build`) and disables itself — no `.env` or conditional imports needed:

- **Plugin** → `withLogInspector()` becomes a no-op passthrough (no routes or instrumentation generated)
- **Component** → `<LogInspector />` renders `null`
- **Server** → fetch/console interceptors and `installServerCapture()` are skipped
- **Client** → error handling, SSE stream, and fetch wrapper are not installed

Your production bundle includes zero inspector overhead.

## Next.js `basePath` Support

If your Next.js project relies on `basePath` (e.g., `basePath: '/traccrops'`), `nextjs-log-inspector` automatically resolves the effective base path for the SSE log stream (`/${basePath}/__log-inspector/stream`) and `/clear` endpoint without extra configuration. You can also explicitly set `NEXT_PUBLIC_BASE_PATH` in your `.env`.

## Generated files

The plugin automatically generates the following files in your `app/` directory (or `src/app/` if you have the `src` convention):

| File | Purpose |
| --- | --- |
| `app/__log-inspector/stream/route.ts` | SSE endpoint the panel listens on |
| `app/__log-inspector/clear/route.ts` | `POST` endpoint to clear buffered logs |
| `instrumentation.ts` (if missing) | Wires up server-side fetch interceptor and incoming request capture |

## Manual composition

If your app already has custom server setup, you can wire capture manually in `instrumentation.ts`:

```ts
import { installServerCapture } from 'nextjs-log-inspector/server';

export async function register() {
  installServerCapture({
    apiPrefix: '/api/',       // only log /api/* requests
    logPages: true,           // log non-API page requests (e.g. /sites)
    errorToJson: true,        // rewrite 4xx/5xx to JSON
    skipPaths: ['/__log-inspector', '/_next/'], // skip inspector routes + Next internals
  });
}
```

## Plugin options

```ts
withLogInspector({
  basePath: '__log-inspector',     // route prefix under app/
  appDir: 'app',                   // app directory (default: 'app', or 'src/app' if src/app exists)
  autoCreateInstrumentation: true, // generate instrumentation.ts
  capture: {
    apiPrefix: '/api/',
    logPages: true,
    errorToJson: true,
    skipPaths: ['/__log-inspector', '/_next/'],
  }
});
```

## How it works

1. The **plugin** generates route handlers for the SSE stream and clear endpoint, and optionally generates `instrumentation.ts`.
2. The **`instrumentation.ts`** (auto-generated or manual) runs at server start:
   - Installs the global `fetch` wrapper so every outbound `fetch` call is captured with initiator, duration and bodies.
   - Patches the Node HTTP server so every incoming `/api/*` request is captured with method, URL, status, duration, initiator and bodies (request & response).
3. The **`LogInspector`** component connects to the SSE stream, replays buffered entries, and renders live.
4. Theme is provided via the compiled `theme.css` — override CSS custom properties on `:root` to re-theme.

## Browser / client

The client automatically:
- Resolves Next.js `basePath` and opens an SSE connection to `/${basePath}/__log-inspector/stream`
- Mirrors server logs into the client store
- Wraps browser `fetch` so the calling file:line is captured via the `X-Initiator` header
- Hijacks `console` and unhandled promise rejections safely using `queueMicrotask` to avoid React render loops

## License

MIT

## Known Limitations

- **Response Bodies for Outbound Fetches (Next.js 15)**: `nextjs-log-inspector` intercepts `globalThis.fetch` to log outbound server requests. However, due to a known bug in Next.js 15 / `undici` (PR #73274), calling `.clone().text()` on a patched fetch response can cause the request to hang indefinitely. To prevent your application from deadlocking, the inspector captures outbound fetch status codes and metadata but **does not** read or log the response body for outbound requests on the server. Inbound request bodies (`/api/*`) are still fully logged.