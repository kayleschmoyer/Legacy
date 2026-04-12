/**
 * WHATWG URL–based replacement for url.parse() that avoids DEP0169.
 *
 * Supports both absolute and relative URLs.  When a relative URL is
 * provided (e.g. "/api/foo?bar=1"), the WHATWG URL constructor would
 * throw because it requires an absolute base.  We fall back to manual
 * string decomposition in that case — enough for the Rollbar /
 * follow-redirects patterns that triggered the deprecation.
 *
 * @see https://nodejs.org/api/deprecations.html#DEP0169
 */
export interface ParsedUrl {
  protocol: string | null;
  slashes: boolean | null;
  auth: string | null;
  host: string | null;
  port: string | null;
  hostname: string | null;
  hash: string | null;
  search: string | null;
  query: Record<string, string> | string | null;
  pathname: string;
  path: string;
  href: string;
}

export function safeUrlParse(
  urlStr: string,
  parseQueryString?: boolean,
): ParsedUrl {
  if (typeof urlStr !== 'string') {
    // Match legacy url.parse() behavior: coerce non-strings
    urlStr = String(urlStr);
  }

  // Protocol-relative URLs (e.g. "//host/path") — url.parse() extracts
  // host/hostname from these.  WHATWG URL requires a scheme, so we prepend
  // a synthetic "http:" and strip it from the result.
  if (urlStr.startsWith('//')) {
    try {
      const parsed = new URL('http:' + urlStr);
      return {
        protocol: null,
        slashes: true,
        auth: parsed.username
          ? parsed.username + (parsed.password ? ':' + parsed.password : '')
          : null,
        host: parsed.host,
        port: parsed.port || null,
        hostname: parsed.hostname,
        hash: parsed.hash || null,
        search: parsed.search || null,
        query: parseQueryString
          ? Object.fromEntries(parsed.searchParams)
          : parsed.search
            ? parsed.search.slice(1)
            : null,
        pathname: parsed.pathname,
        path: parsed.pathname + (parsed.search || ''),
        href: urlStr,
      };
    } catch {
      // Fall through to manual decomposition
    }
  }

  try {
    const parsed = new URL(urlStr);
    return {
      protocol: parsed.protocol,
      slashes: true,
      auth: parsed.username
        ? parsed.username + (parsed.password ? ':' + parsed.password : '')
        : null,
      host: parsed.host,
      port: parsed.port || null,
      hostname: parsed.hostname,
      hash: parsed.hash || null,
      search: parsed.search || null,
      query: parseQueryString
        ? Object.fromEntries(parsed.searchParams)
        : parsed.search
          ? parsed.search.slice(1)
          : null,
      pathname: parsed.pathname,
      path: parsed.pathname + (parsed.search || ''),
      href: parsed.href,
    };
  } catch {
    // Relative or non-standard URL — decompose manually
    const qIdx = urlStr.indexOf('?');
    const hIdx = urlStr.indexOf('#');

    let pathname: string;
    let search: string | null;
    let hash: string | null;

    // If # appears before ?, the ? is part of the fragment — not a query
    // separator.  This matches url.parse() behavior.
    const hasQuery = qIdx !== -1 && (hIdx === -1 || qIdx < hIdx);

    if (hasQuery) {
      pathname = urlStr.slice(0, qIdx);
      if (hIdx !== -1) {
        search = urlStr.slice(qIdx, hIdx);
        hash = urlStr.slice(hIdx);
      } else {
        search = urlStr.slice(qIdx);
        hash = null;
      }
    } else if (hIdx !== -1) {
      pathname = urlStr.slice(0, hIdx);
      search = null;
      hash = urlStr.slice(hIdx);
    } else {
      pathname = urlStr;
      search = null;
      hash = null;
    }

    let query: Record<string, string> | string | null;
    if (parseQueryString && search) {
      try {
        query = Object.fromEntries(new URLSearchParams(search));
      } catch {
        query = null;
      }
    } else {
      query = search ? search.slice(1) : null;
    }

    return {
      protocol: null,
      slashes: null,
      auth: null,
      host: null,
      port: null,
      hostname: null,
      hash: hash,
      search: search,
      query: query,
      pathname: pathname,
      path: pathname + (search || ''),
      href: urlStr,
    };
  }
}
