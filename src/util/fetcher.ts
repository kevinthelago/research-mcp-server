import { request, type Dispatcher } from 'undici';
import { lookup } from 'node:dns/promises';

// ---------------------------------------------------------------------------
// Allowlist — only these hostnames (and their subdomains) may be fetched.
// ---------------------------------------------------------------------------
const ALLOWED_HOST_SUFFIXES: ReadonlySet<string> = new Set([
  'arxiv.org',
  'semanticscholar.org',
  'ncbi.nlm.nih.gov',
  'crossref.org',
  'doi.org',
  'unpaywall.org',
  'openalex.org',
  'europepmc.org',
  'biorxiv.org',
  'medrxiv.org',
  'pmc.ncbi.nlm.nih.gov',
  'pubmed.ncbi.nlm.nih.gov',
  'eutils.ncbi.nlm.nih.gov',
]);

// ---------------------------------------------------------------------------
// Private / reserved IP ranges that must never be reached (SSRF guard).
// ---------------------------------------------------------------------------
// Covers: loopback, link-local, private (RFC 1918 / RFC 4193), CGNAT,
// documentation, multicast, broadcast, and unspecified.
const BLOCKED_IP_CIDRS: ReadonlyArray<[bigint, bigint]> = (() => {
  function ipv4ToBigInt(addr: string): bigint {
    const parts = addr.split('.').map(Number);
    return (
      (BigInt(parts[0] ?? 0) << 24n) |
      (BigInt(parts[1] ?? 0) << 16n) |
      (BigInt(parts[2] ?? 0) << 8n) |
      BigInt(parts[3] ?? 0)
    );
  }
  function cidr4(addr: string, prefix: number): [bigint, bigint] {
    const base = ipv4ToBigInt(addr);
    const mask = prefix === 0 ? 0n : (((1n << BigInt(prefix)) - 1n) << BigInt(32 - prefix));
    return [base & mask, base | ~mask & 0xffffffffn];
  }
  return [
    cidr4('0.0.0.0', 8),        // unspecified
    cidr4('10.0.0.0', 8),       // private
    cidr4('100.64.0.0', 10),    // CGNAT
    cidr4('127.0.0.0', 8),      // loopback
    cidr4('169.254.0.0', 16),   // link-local
    cidr4('172.16.0.0', 12),    // private
    cidr4('192.0.0.0', 24),     // IETF protocol
    cidr4('192.0.2.0', 24),     // documentation
    cidr4('192.168.0.0', 16),   // private
    cidr4('198.18.0.0', 15),    // benchmarking
    cidr4('198.51.100.0', 24),  // documentation
    cidr4('203.0.113.0', 24),   // documentation
    cidr4('224.0.0.0', 4),      // multicast
    cidr4('240.0.0.0', 4),      // reserved
    cidr4('255.255.255.255', 32), // broadcast
  ];
})();

function isPrivateIPv4(addr: string): boolean {
  const parts = addr.split('.');
  if (parts.length !== 4 || parts.some(p => !/^\d+$/.test(p))) return false;
  const ip =
    (BigInt(Number(parts[0])) << 24n) |
    (BigInt(Number(parts[1])) << 16n) |
    (BigInt(Number(parts[2])) << 8n) |
    BigInt(Number(parts[3]));
  return BLOCKED_IP_CIDRS.some(([lo, hi]) => ip >= lo && ip <= hi);
}

// IPv6 private/reserved blocks
const BLOCKED_IPV6_PREFIXES: ReadonlyArray<string> = [
  '::1',           // loopback
  'fc', 'fd',      // unique local (fc00::/7)
  'fe80',          // link-local
  'ff',            // multicast
  '::',            // unspecified
];

function isPrivateIPv6(addr: string): boolean {
  const lower = addr.toLowerCase().replace(/^\[|\]$/g, '');
  if (lower === '::1' || lower === '::') return true;
  const prefix2 = lower.slice(0, 2);
  return (
    prefix2 === 'fc' ||
    prefix2 === 'fd' ||
    prefix2 === 'ff' ||
    lower.startsWith('fe80')
  );
}

export class FetchError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'SSRF_BLOCKED'
      | 'HOST_NOT_ALLOWED'
      | 'HTTP_ONLY'
      | 'TOO_LARGE'
      | 'TIMEOUT'
      | 'HTTP_ERROR'
      | 'DNS_BLOCKED',
  ) {
    super(message);
    this.name = 'FetchError';
  }
}

export interface FetchOptions {
  /** Maximum bytes to download (default 20 MB) */
  maxBytes?: number;
  /** Request timeout in ms (default 30 s) */
  timeoutMs?: number;
  /** Max redirects to follow (default 5) */
  maxRedirects?: number;
  /** Additional request headers */
  headers?: Record<string, string>;
  /** Override dispatcher (used in tests to intercept requests) */
  dispatcher?: Dispatcher;
}

export interface FetchResult {
  body: Buffer;
  contentType: string;
  status: number;
  url: string;
}

const DEFAULT_MAX_BYTES = 20 * 1024 * 1024; // 20 MB
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_REDIRECTS = 5;

function isHostAllowed(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  return [...ALLOWED_HOST_SUFFIXES].some(
    suffix => lower === suffix || lower.endsWith(`.${suffix}`),
  );
}

async function checkDnsNotPrivate(hostname: string): Promise<void> {
  let addresses: string[];
  try {
    const results = await lookup(hostname, { all: true });
    addresses = results.map(r => r.address);
  } catch {
    // DNS failure — let undici surface a connection error naturally
    return;
  }
  for (const addr of addresses) {
    if (isPrivateIPv4(addr) || isPrivateIPv6(addr)) {
      throw new FetchError(
        `DNS resolved to a private/reserved IP for host "${hostname}" — SSRF guard blocked`,
        'DNS_BLOCKED',
      );
    }
  }
}

/**
 * Fetches a URL with SSRF protections:
 * - HTTPS only
 * - Source-host allowlist enforced before DNS resolution
 * - DNS resolved addresses checked against private/reserved CIDR blocks
 * - Download size capped (default 20 MB)
 * - Request timeout (default 30 s)
 * - Redirect count capped (default 5)
 */
export async function guardedFetch(
  url: string,
  options: FetchOptions = {},
): Promise<FetchResult> {
  const {
    maxBytes = DEFAULT_MAX_BYTES,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxRedirects = DEFAULT_MAX_REDIRECTS,
    headers = {},
    dispatcher,
  } = options;

  // 1. Protocol check — HTTPS only
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new FetchError(`Invalid URL: ${url}`, 'SSRF_BLOCKED');
  }
  if (parsed.protocol !== 'https:') {
    throw new FetchError(
      `Only HTTPS URLs are permitted (got "${parsed.protocol}")`,
      'HTTP_ONLY',
    );
  }

  // 2. Host allowlist check
  const hostname = parsed.hostname;
  if (!isHostAllowed(hostname)) {
    throw new FetchError(
      `Host "${hostname}" is not in the fetch allowlist`,
      'HOST_NOT_ALLOWED',
    );
  }

  // 3. DNS check — resolve and verify no private IPs
  await checkDnsNotPrivate(hostname);

  // 4. Perform the request
  const requestOptions: Parameters<typeof request>[1] = {
    method: 'GET',
    headers: {
      'user-agent': 'research-mcp-server/0.1 (https://github.com/kevinthelago/research-mcp-server)',
      ...headers,
    },
    maxRedirections: maxRedirects,
    bodyTimeout: timeoutMs,
    headersTimeout: timeoutMs,
    ...(dispatcher != null ? { dispatcher } : {}),
  };

  let response: Awaited<ReturnType<typeof request>>;
  try {
    response = await request(url, requestOptions);
  } catch (err) {
    if (err instanceof FetchError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('timeout') || msg.includes('Timeout')) {
      throw new FetchError(`Request timed out after ${timeoutMs}ms: ${url}`, 'TIMEOUT');
    }
    throw err;
  }

  const { statusCode, headers: respHeaders, body } = response;

  // 5. Read body with size cap
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of body) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    totalBytes += buf.byteLength;
    if (totalBytes > maxBytes) {
      body.destroy();
      throw new FetchError(
        `Response exceeds size limit of ${maxBytes} bytes`,
        'TOO_LARGE',
      );
    }
    chunks.push(buf);
  }

  const contentType =
    typeof respHeaders['content-type'] === 'string'
      ? respHeaders['content-type']
      : Array.isArray(respHeaders['content-type'])
        ? (respHeaders['content-type'][0] ?? '')
        : '';

  if (statusCode >= 400) {
    throw new FetchError(
      `HTTP ${statusCode} from ${url}`,
      'HTTP_ERROR',
    );
  }

  return {
    body: Buffer.concat(chunks),
    contentType,
    status: statusCode,
    url,
  };
}
