// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { sanitizeUrl } from '../utils';
import { computeSize, normalizeTag, parseLogEntry, prettyJson, comparators, generateCurlCommand, getMethodBadgeClass, getStatusBadgeClass, getReqSizeColorClass, getResSizeColorClass } from '../components/logUtils';
import type { LogEntry } from '../client/store';

describe('Workflow: parseLogEntry rendering pipeline', () => {
	it('parses an API call message into structured ParsedLog', () => {
		const log = { id: "test",
			timestamp: '10:30:00 AM',
			message: '[API] GET /api/users — Success (HTTP 200, 45ms)',
			type: 'info',
			tag: 'API',
			method: 'GET',
			url: '/api/users',
			status: 200,
			duration_ms: 45
		};

		const parsed = parseLogEntry(log as LogEntry, 0);

		expect(parsed.tag).toBe('client');
		expect(parsed.method).toBe('GET');
		expect(parsed.url).toBe('/api/users');
		expect(parsed.statusCode).toBe(200);
		expect(parsed.durationMs).toBe(45);
		expect(parsed.durationText).toBe('45ms');
		expect(parsed.isApiCall).toBe(true);
		expect(parsed.isSuccess).toBe(true);
		expect(parsed.isError).toBe(false);
		expect(parsed.isPending).toBe(false);
	});

	it('parses an API error with 500 status', () => {
		const log = { id: "test",
			timestamp: '10:30:00 AM',
			message: '[API] POST /api/orders — Failed (HTTP 500, 120ms)',
			type: 'error',
			tag: 'API',
			method: 'POST',
			url: '/api/orders',
			status: 500,
			duration_ms: 120
		};

		const parsed = parseLogEntry(log as LogEntry, 0);

		expect(parsed.statusCode).toBe(500);
		expect(parsed.isError).toBe(true);
		expect(parsed.isSuccess).toBe(false);
	});

	it('parses pending entries', () => {
		const log = { id: "test",
			timestamp: '10:30:00 AM',
			message: 'Pending...',
			type: 'info',
			status: 'Pending'
		};

		const parsed = parseLogEntry(log as LogEntry, 0);

		expect(parsed.isPending).toBe(true);
		expect(parsed.durationText).toBe('Pending...');
		expect(parsed.statusText).toBe('PENDING');
	});

	it('extracts initiator from Location: details', () => {
		const log = { id: "test",
			timestamp: '10:30:00 AM',
			message: '[console.log] Hello world',
			type: 'info',
			details: 'Location: /app/page.tsx:30'
		};

		const parsed = parseLogEntry(log as LogEntry, 0);
		expect(parsed.initiator).toContain('page.tsx');
	});

	it('falls back to Server Stream for API tag without initiator', () => {
		const log = { id: "test",
			timestamp: '10:30:00 AM',
			message: 'something',
			type: 'info',
			tag: 'API'
		};

		const parsed = parseLogEntry(log as LogEntry, 0);
		expect(parsed.initiator).toBe('Server Stream');
	});

	it('falls back to Console for console tag', () => {
		const log = { id: "test",
			timestamp: '10:30:00 AM',
			message: '[console.log] test',
			type: 'info',
			tag: 'console.log'
		};

		const parsed = parseLogEntry(log as LogEntry, 0);
		expect(parsed.initiator).toBe('Console');
	});

	it('marks cached responses', () => {
		const log = { id: "test",
			timestamp: '10:30:00 AM',
			message: '[API] GET /api/data',
			type: 'info',
			cached: true,
			duration_ms: 0,
			tag: 'API',
			method: 'GET',
			url: '/api/data'
		};

		const parsed = parseLogEntry(log as LogEntry, 0);
		expect(parsed.cached).toBe(true);
	});

	it('sets initiator from explicit log.initiator', () => {
		const log = { id: "test",
			timestamp: '10:30:00 AM',
			message: 'test',
			type: 'info',
			initiator: 'myFunc (src/app.ts:10)'
		};

		const parsed = parseLogEntry(log as LogEntry, 0);
		expect(parsed.initiator).toBe('myFunc (src/app.ts:10)');
	});

	it('uses User Input for user type', () => {
		const log = { id: "test",
			timestamp: '10:30:00 AM',
			message: 'user clicked button',
			type: 'user'
		};

		const parsed = parseLogEntry(log as LogEntry, 0);
		expect(parsed.initiator).toBe('User Input');
	});
});

describe('sanitizeUrl', () => {
	it('passes clean URLs through', () => {
		expect(sanitizeUrl('https://api.example.com/users')).toBe('https://api.example.com/users');
	});

	it('returns empty string for empty input', () => {
		expect(sanitizeUrl('')).toBe('');
	});

	it('extracts path from HTML doctype blob', () => {
		const input = '<!doctype html><html><body>Error</body></html>';
		expect(sanitizeUrl(input)).toBe('API Request');
	});

	it('extracts path from JSON error blob', () => {
		const input = '/api/users{"status":500,"error":"fail"}';
		expect(sanitizeUrl(input)).toBe('/api/users');
	});

	it('handles newlines in URL by extracting path', () => {
		expect(sanitizeUrl('/api.com\nnoise')).toBe('/api.com');
	});
});

describe('computeSize', () => {
	it('returns 0 for null/undefined', () => {
		expect(computeSize(null)).toEqual({ bytes: 0, formatted: '0 B' });
		expect(computeSize(undefined)).toEqual({ bytes: 0, formatted: '0 B' });
	});

	it('computes size for small strings', () => {
		const result = computeSize('hello');
		expect(result.bytes).toBe(5);
		expect(result.formatted).toBe('5 B');
	});

	it('formats KB for > 1KB', () => {
		const result = computeSize('x'.repeat(1500));
		expect(result.bytes).toBeGreaterThan(1024);
		expect(result.formatted).toContain('KB');
	});

	it('formats MB for > 1MB', () => {
		const result = computeSize('x'.repeat(1_500_000));
		expect(result.formatted).toContain('MB');
	});

	it('serializes objects to JSON for size calculation', () => {
		const result = computeSize({ key: 'value' });
		expect(result.bytes).toBeGreaterThan(0);
	});
});

describe('normalizeTag', () => {
	it('normalizes API tag based on cache', () => {
		expect(normalizeTag('API', false)).toBe('client');
		expect(normalizeTag('API', true)).toBe('server cache');
	});

	it('normalizes known tags', () => {
		expect(normalizeTag('API CLIENT', false)).toBe('client');
		expect(normalizeTag('SERVER LOG', false)).toBe('server log');
		expect(normalizeTag('SERVER CACHE', false)).toBe('server cache');
		expect(normalizeTag('CLIENT CACHE', false)).toBe('client cache');
	});

	it('defaults to client log for unknown tags', () => {
		expect(normalizeTag('RANDOM', false)).toBe('client log');
		expect(normalizeTag(undefined, false)).toBe('client log');
	});
});

describe('prettyJson', () => {
	it('returns empty string for null/undefined', () => {
		expect(prettyJson(null)).toBe('');
		expect(prettyJson(undefined)).toBe('');
	});

	it('pretty-prints objects', () => {
		expect(prettyJson({ a: 1 })).toContain('"a": 1');
	});

	it('parses JSON strings', () => {
		expect(prettyJson('{"a":1}')).toContain('"a": 1');
	});

	it('returns invalid JSON strings as-is', () => {
		expect(prettyJson('not json')).toBe('not json');
	});
});

describe('comparators', () => {
	const a = { index: 1, statusCode: 200, statusText: 'OK', durationMs: 100, resSizeBytes: 50, reqSizeBytes: 10, tag: 'a', method: 'GET', url: '/api/a', initiator: 'initA' } as any;
	const b = { index: 2, statusCode: 404, statusText: 'Not Found', durationMs: 200, resSizeBytes: 100, reqSizeBytes: 20, tag: 'b', method: 'POST', url: '/api/b', initiator: 'initB' } as any;

	it('timestamp sorts by index', () => {
		expect(comparators.timestamp(a, b)).toBeLessThan(0);
	});

	it('status sorts by statusCode', () => {
		expect(comparators.status(a, b)).toBeLessThan(0);
	});

	it('duration sorts by durationMs', () => {
		expect(comparators.duration(a, b)).toBeLessThan(0);
	});

	it('size sorts by total bytes', () => {
		expect(comparators.size(a, b)).toBeLessThan(0);
	});

	it('method sorts alphabetically', () => {
		expect(comparators.method(a, b)).toBeLessThan(0);
	});

	it('url sorts alphabetically', () => {
		expect(comparators.url(a, b)).toBeLessThan(0);
	});
});

describe('badge classes', () => {
	it('returns correct method badge classes', () => {
		expect(getMethodBadgeClass('GET')).toContain('emerald');
		expect(getMethodBadgeClass('POST')).toContain('blue');
		expect(getMethodBadgeClass('PUT')).toContain('amber');
		expect(getMethodBadgeClass('DELETE')).toContain('rose');
		expect(getMethodBadgeClass('PATCH')).toContain('purple');
		expect(getMethodBadgeClass('OPTIONS')).toContain('slate');
	});

	it('returns correct status badge classes', () => {
		expect(getStatusBadgeClass({ isPending: true, isError: false, isSuccess: false } as any)).toContain('amber');
		expect(getStatusBadgeClass({ isPending: false, isError: true, isSuccess: false } as any)).toContain('rose');
		expect(getStatusBadgeClass({ isPending: false, isError: false, isSuccess: true } as any)).toContain('emerald');
	});

	it('returns correct size color classes', () => {
		expect(getReqSizeColorClass(100)).toContain('sky');
		expect(getReqSizeColorClass(15000)).toContain('amber');
		expect(getReqSizeColorClass(60000)).toContain('rose');
		expect(getResSizeColorClass(100)).toContain('emerald');
	});
});

describe('generateCurlCommand', () => {
	it('generates curl for GET request', () => {
		const log = { method: 'GET', url: '/api/users', requestBody: undefined } as any;
		const curl = generateCurlCommand(log);
		expect(curl).toContain('curl -X GET');
		expect(curl).toContain('/api/users');
	});

	it('generates curl for POST with body', () => {
		const log = { method: 'POST', url: '/api/orders', requestBody: { item: 'book' } } as any;
		const curl = generateCurlCommand(log);
		expect(curl).toContain('curl -X POST');
		expect(curl).toContain('Content-Type: application/json');
		expect(curl).toContain('"item":"book"');
	});
});
