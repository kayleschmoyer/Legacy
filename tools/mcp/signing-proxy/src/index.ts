/**
 * MCP SigV4 Signing Proxy — local developer tool
 *
 * Listens on three local HTTP ports and forwards each request to the
 * corresponding hosted MCP Lambda Function URL, signing each request with
 * AWS SigV4 so the Lambda's AWS_IAM authorization check passes.
 *
 * Usage:
 *   pnpm exec nx run mcp-signing-proxy:start
 *
 * Environment variables (set in .env.local):
 *   MCP_JIRA_URL     — Lambda Function URL for the Jira MCP server
 *   MCP_GITHUB_URL   — Lambda Function URL for the GitHub MCP server
 *   MCP_CI_URL       — Lambda Function URL for the CI MCP server
 *   MCP_AWS_PROFILE  — AWS profile to use (optional; defaults to credential chain)
 *   AWS_REGION       — AWS region (defaults to us-east-1)
 *
 * Ports:
 *   4195 → MCP_JIRA_URL
 *   4196 → MCP_GITHUB_URL
 *   4197 → MCP_CI_URL
 *
 * Configure your MCP client (e.g. Claude Desktop, VS Code MCP extension) to
 * point at http://localhost:419{5,6,7} instead of the Lambda URL directly.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import https from 'node:https';
import { URL } from 'node:url';
import { config as loadDotenv } from 'dotenv';
import { SignatureV4 } from '@smithy/signature-v4';
import { Sha256 } from '@aws-crypto/sha256-js';
import { defaultProvider } from '@aws-sdk/credential-provider-node';
import { fromIni } from '@aws-sdk/credential-provider-ini';
import { LOGGER } from '@legacy-sports/logging/server';

// Load .env.local then .env so users don't need to manually export vars.
// dotenv silently skips files that don't exist.
const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../..',
);
loadDotenv({ path: path.join(repoRoot, '.env.local') });
loadDotenv({ path: path.join(repoRoot, '.env') });

const REGION = process.env['AWS_REGION'] ?? 'us-east-1';
const PROFILE = process.env['MCP_AWS_PROFILE'];

// Hop-by-hop headers that must not be forwarded to the upstream
const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'host', // will be set from the target URL
]);

// AWS auth/signing headers that must be stripped before re-signing — forwarding
// these would corrupt the SigV4 canonical request and cause SignatureDoesNotMatch.
const AWS_SIGNING_HEADERS = new Set([
  'authorization',
  'x-amz-date',
  'x-amz-security-token',
  'x-amz-content-sha256',
]);

const SERVERS: Array<{ port: number; envVar: string; name: string }> = [
  { port: 4195, envVar: 'MCP_JIRA_URL', name: 'jira' },
  { port: 4196, envVar: 'MCP_GITHUB_URL', name: 'github' },
  { port: 4197, envVar: 'MCP_CI_URL', name: 'ci' },
];

function getCredentials() {
  if (PROFILE) {
    return fromIni({ profile: PROFILE });
  }
  // defaultProvider resolves: env vars → ~/.aws/credentials → SSO → instance profile
  return defaultProvider();
}

function buildSigner() {
  return new SignatureV4({
    credentials: getCredentials(),
    region: REGION,
    service: 'lambda',
    sha256: Sha256,
  });
}

const MAX_REQUEST_BODY_BYTES = 25 * 1024 * 1024;

class PayloadTooLargeError extends Error {
  readonly statusCode = 413;

  constructor(limitBytes: number) {
    super(`Request body exceeds the ${limitBytes} byte limit`);
    this.name = 'PayloadTooLargeError';
  }
}

function readBody(req: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    let settled = false;

    req.on('data', (chunk: Buffer | string) => {
      const bufferChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalBytes += bufferChunk.length;

      if (totalBytes > MAX_REQUEST_BODY_BYTES) {
        settled = true;
        req.destroy();
        reject(new PayloadTooLargeError(MAX_REQUEST_BODY_BYTES));
        return;
      }

      chunks.push(bufferChunk);
    });

    req.on('end', () => {
      if (!settled) {
        resolve(Buffer.concat(chunks));
      }
    });

    req.on('error', (error) => {
      if (!settled) {
        reject(error);
      }
    });

    req.on('close', () => {
      if (!settled) {
        settled = true;
        req.destroy();
        reject(
          new Error('Client connection closed before body was fully received'),
        );
      }
    });
  });
}

const ABSOLUTE_URL_RE = /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//;

/**
 * Build the full upstream URL from the target base and the incoming request URL.
 * Handles origin-form (/path?query) and absolute-form; rejects OPTIONS * and
 * non-HTTP/HTTPS absolute URLs with a clear error.
 */
function buildTargetRequestUrl(
  targetUrl: string,
  requestUrl: string | undefined,
): URL {
  const upstreamUrl = new URL(targetUrl);
  const normalizedRequestUrl = requestUrl ?? '/';

  if (normalizedRequestUrl === '*') {
    throw new Error('Unsupported request target');
  }

  let requestPath: URL;
  if (ABSOLUTE_URL_RE.test(normalizedRequestUrl)) {
    const absoluteRequestUrl = new URL(normalizedRequestUrl);
    if (
      absoluteRequestUrl.protocol !== 'http:' &&
      absoluteRequestUrl.protocol !== 'https:'
    ) {
      throw new Error('Unsupported absolute-form request URL');
    }
    requestPath = new URL(
      `${absoluteRequestUrl.pathname}${absoluteRequestUrl.search}`,
      'http://localhost',
    );
  } else {
    const originFormPath = normalizedRequestUrl.startsWith('/')
      ? normalizedRequestUrl
      : `/${normalizedRequestUrl}`;
    requestPath = new URL(originFormPath, 'http://localhost');
  }

  const basePath = upstreamUrl.pathname.replace(/\/$/, '');
  upstreamUrl.pathname = `${basePath}${requestPath.pathname}` || '/';
  upstreamUrl.search = requestPath.search;
  upstreamUrl.hash = '';

  return upstreamUrl;
}

async function startProxy(port: number, targetUrl: string, name: string) {
  // Lambda Function URLs are always HTTPS — validate up front for a clear error
  if (!targetUrl.startsWith('https://')) {
    throw new Error(
      `[mcp-proxy:${name}] ${targetUrl} is not an https:// URL — Lambda Function URLs must use HTTPS`,
    );
  }

  const signer = buildSigner();

  const server = http.createServer(async (req, res) => {
    try {
      const body = await readBody(req);

      let parsedFull: URL;
      try {
        parsedFull = buildTargetRequestUrl(targetUrl, req.url);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Invalid request URL';
        res.writeHead(400);
        res.end(msg);
        return;
      }

      // Per RFC 9110 §7.6.1, headers listed in the Connection header are also
      // hop-by-hop and must be stripped for this specific request.
      const connectionHeaderExtras = new Set(
        String(req.headers['connection'] ?? '')
          .split(',')
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean),
      );

      // Forward incoming headers, excluding hop-by-hop, host (set from target),
      // and AWS auth/signing headers (will be set by SigV4 signer below).
      const forwardedHeaders: Record<string, string> = {};
      for (const [key, value] of Object.entries(req.headers)) {
        const lower = key.toLowerCase();
        if (
          !HOP_BY_HOP.has(lower) &&
          !connectionHeaderExtras.has(lower) &&
          !AWS_SIGNING_HEADERS.has(lower) &&
          value !== undefined
        ) {
          forwardedHeaders[key] = Array.isArray(value)
            ? value.join(', ')
            : value;
        }
      }

      // Resolve content-type case-insensitively from forwarded headers, then
      // normalize: Node's http.IncomingMessage headers are lower-cased already,
      // but be explicit so the SigV4 canonical headers string is well-formed.
      const rawContentType = req.headers['content-type'];
      const contentType = Array.isArray(rawContentType)
        ? rawContentType.join(', ')
        : (rawContentType ?? 'application/json');

      // Build the request object that SignatureV4 expects
      const toSign = {
        method: req.method ?? 'POST',
        hostname: parsedFull.hostname,
        path: parsedFull.pathname + parsedFull.search,
        protocol: parsedFull.protocol,
        headers: {
          ...forwardedHeaders,
          host: parsedFull.hostname,
          'content-type': contentType,
          ...(body.length > 0 ? { 'content-length': String(body.length) } : {}),
        } as Record<string, string>,
        body: body.length > 0 ? body : undefined,
      };

      const signed = await signer.sign(toSign);

      const options: https.RequestOptions = {
        method: signed.method,
        hostname: parsedFull.hostname,
        path: parsedFull.pathname + parsedFull.search,
        headers: signed.headers as Record<string, string>,
      };

      const proxyReq = https.request(options, (proxyRes) => {
        // Per RFC 9110 §7.6.1, headers listed in the upstream Connection header
        // are also hop-by-hop and must not be forwarded to the client.
        const responseConnectionHeaderExtras = new Set(
          (Array.isArray(proxyRes.headers.connection)
            ? proxyRes.headers.connection.join(',')
            : String(proxyRes.headers.connection ?? '')
          )
            .split(',')
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean),
        );

        const responseHeaders = Object.fromEntries(
          Object.entries(proxyRes.headers).filter(([key]) => {
            const lower = key.toLowerCase();
            return (
              !HOP_BY_HOP.has(lower) &&
              !responseConnectionHeaderExtras.has(lower)
            );
          }),
        );
        res.writeHead(proxyRes.statusCode ?? 200, responseHeaders);
        proxyRes.pipe(res);

        // If the client disconnects mid-response, cancel the upstream stream to
        // avoid leaving in-flight sockets consuming local resources.
        res.on('close', () => {
          proxyRes.destroy();
        });
      });

      // If the client disconnects before or during the upstream request, cancel
      // it so we don't keep sockets open unnecessarily.
      res.on('close', () => {
        proxyReq.destroy();
      });

      proxyReq.on('error', (err) => {
        LOGGER.error(`[mcp-proxy:${name}] upstream error`, err);
        res.writeHead(502);
        res.end('Bad gateway');
      });

      if (body.length > 0) {
        proxyReq.write(body);
      }
      proxyReq.end();
    } catch (err) {
      if (err instanceof PayloadTooLargeError) {
        res.writeHead(err.statusCode);
        res.end(err.message);
        return;
      }
      LOGGER.error(
        `[mcp-proxy:${name}] error`,
        err instanceof Error ? err : new Error(String(err)),
      );
      res.writeHead(500);
      res.end('Internal proxy error');
    }
  });

  // Bind to localhost only — the proxy signs with local AWS credentials and
  // must not be exposed to other network interfaces.
  await new Promise<void>((resolve, reject) => {
    const onError = (err: NodeJS.ErrnoException) => {
      server.off('listening', onListening);
      reject(
        new Error(
          `[mcp-proxy:${name}] failed to listen on http://localhost:${port}: ${err.message}`,
        ),
      );
    };

    const onListening = () => {
      server.off('error', onError);
      LOGGER.info(
        `[mcp-proxy:${name}] listening on http://localhost:${port} → ${targetUrl}`,
      );
      resolve();
    };

    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, '127.0.0.1');
  });
}

async function main() {
  let started = 0;
  for (const { port, envVar, name } of SERVERS) {
    const url = process.env[envVar];
    if (!url) {
      LOGGER.warn(
        `[mcp-proxy:${name}] ${envVar} not set — skipping port ${port}`,
      );
      continue;
    }
    await startProxy(port, url, name);
    started++;
  }

  if (started === 0) {
    LOGGER.error(
      'No MCP URLs configured. Set MCP_JIRA_URL, MCP_GITHUB_URL, and/or MCP_CI_URL in .env.local',
    );
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  LOGGER.error('Fatal', err instanceof Error ? err : new Error(String(err)));
  process.exit(1);
});
