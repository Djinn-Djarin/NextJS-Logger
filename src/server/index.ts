import { installServerFetchInterceptor } from './fetchInterceptor';
import { installServerConsoleInterceptor } from './consoleInterceptor';

export * from './logStore';
export * from './fetchInterceptor';
export * from './consoleInterceptor';
export * from './handlers';
export * from './capture';

// Zero-code: wrapping the server-side global `fetch` means every outbound call
// is captured automatically the moment this module is loaded. Incoming
// `/api/*` requests are captured by `installServerCapture` — wire it up in
// `instrumentation.ts` (the plugin generates the file for you).
if (process.env.NODE_ENV !== 'production') {
	installServerFetchInterceptor();
	installServerConsoleInterceptor();
}