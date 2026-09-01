/** Best-effort clean URL string for display, stripping HTML/JSON error blobs. */
export function sanitizeUrl(rawUrl: string): string {
	if (!rawUrl) return '';
	if (
		rawUrl.includes('<!doctype') ||
		rawUrl.includes('<html') ||
		rawUrl.includes('{"status":') ||
		rawUrl.includes('\n')
	) {
		const pathMatch = rawUrl.match(/(\/(?:api|projects|chain-detail)[^\s"'{}>]*)/);
		if (pathMatch) return pathMatch[1];
		const firstLine = rawUrl.split(/[\r\n]/)[0].split(/[{<]/)[0].trim();
		return firstLine.slice(0, 80) || 'API Request';
	}
	return rawUrl;
}