import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { guardedFetch, FetchError } from '../../util/fetcher.js';

// We mock 'node:dns/promises' to control what IPs hostnames resolve to.
// We mock 'undici' to avoid real network calls.

vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(),
}));

vi.mock('undici', () => {
  const mockRequest = vi.fn();
  return { request: mockRequest };
});

import { lookup } from 'node:dns/promises';
import { request } from 'undici';

const mockLookup = vi.mocked(lookup);
const mockRequest = vi.mocked(request);

function makeSuccessResponse(body: string, contentType = 'text/plain') {
  const chunks = [Buffer.from(body)];
  let idx = 0;
  const asyncIterable = {
    [Symbol.asyncIterator]() {
      return {
        next: async () => {
          if (idx < chunks.length) {
            return { value: chunks[idx++], done: false };
          }
          return { value: undefined, done: true };
        },
      };
    },
    destroy: vi.fn(),
  };
  return {
    statusCode: 200,
    headers: { 'content-type': contentType },
    body: asyncIterable,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: resolve to a public IP
  mockLookup.mockResolvedValue([{ address: '151.101.1.1', family: 4 }] as unknown as Awaited<ReturnType<typeof lookup>>);
  // Default: return a successful response
  mockRequest.mockResolvedValue(makeSuccessResponse('OK') as never);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('guardedFetch — SSRF security guards', () => {
  describe('protocol enforcement', () => {
    it('rejects HTTP URLs', async () => {
      await expect(
        guardedFetch('http://arxiv.org/pdf/2101.00001'),
      ).rejects.toThrow(FetchError);

      await expect(
        guardedFetch('http://arxiv.org/pdf/2101.00001'),
      ).rejects.toMatchObject({ code: 'HTTP_ONLY' });
    });

    it('rejects FTP URLs', async () => {
      await expect(
        guardedFetch('ftp://arxiv.org/paper.pdf'),
      ).rejects.toMatchObject({ code: 'HTTP_ONLY' });
    });

    it('rejects javascript: URLs', async () => {
      await expect(
        guardedFetch('javascript:alert(1)'),
      ).rejects.toThrow(FetchError);
    });

    it('rejects invalid URLs', async () => {
      await expect(guardedFetch('not a url')).rejects.toThrow(FetchError);
    });
  });

  describe('host allowlist', () => {
    it('allows arxiv.org', async () => {
      const result = await guardedFetch('https://arxiv.org/pdf/2101.00001');
      expect(result.status).toBe(200);
    });

    it('allows export.arxiv.org subdomain', async () => {
      const result = await guardedFetch('https://export.arxiv.org/abs/2101.00001');
      expect(result.status).toBe(200);
    });

    it('allows api.semanticscholar.org', async () => {
      const result = await guardedFetch('https://api.semanticscholar.org/graph/v1/paper/12345');
      expect(result.status).toBe(200);
    });

    it('blocks an arbitrary external host', async () => {
      await expect(
        guardedFetch('https://evil.example.com/steal-data'),
      ).rejects.toMatchObject({ code: 'HOST_NOT_ALLOWED' });
    });

    it('blocks a host that merely contains an allowed suffix', async () => {
      // "notarxiv.org" must NOT match the "arxiv.org" suffix rule
      await expect(
        guardedFetch('https://notarxiv.org/pdf/paper.pdf'),
      ).rejects.toMatchObject({ code: 'HOST_NOT_ALLOWED' });
    });

    it('blocks localhost', async () => {
      await expect(
        guardedFetch('https://localhost/api/internal'),
      ).rejects.toMatchObject({ code: 'HOST_NOT_ALLOWED' });
    });

    it('blocks 127.0.0.1 as a host', async () => {
      await expect(
        guardedFetch('https://127.0.0.1/secret'),
      ).rejects.toMatchObject({ code: 'HOST_NOT_ALLOWED' });
    });
  });

  describe('DNS-resolved private IP blocks', () => {
    it('blocks loopback IP 127.0.0.1 resolved from hostname', async () => {
      mockLookup.mockResolvedValue([{ address: '127.0.0.1', family: 4 }] as never);
      await expect(
        guardedFetch('https://arxiv.org/pdf/paper.pdf'),
      ).rejects.toMatchObject({ code: 'DNS_BLOCKED' });
    });

    it('blocks private 10.x.x.x IP', async () => {
      mockLookup.mockResolvedValue([{ address: '10.0.0.1', family: 4 }] as never);
      await expect(
        guardedFetch('https://arxiv.org/pdf/paper.pdf'),
      ).rejects.toMatchObject({ code: 'DNS_BLOCKED' });
    });

    it('blocks link-local 169.254.x.x IP', async () => {
      mockLookup.mockResolvedValue([{ address: '169.254.169.254', family: 4 }] as never);
      await expect(
        guardedFetch('https://arxiv.org/pdf/paper.pdf'),
      ).rejects.toMatchObject({ code: 'DNS_BLOCKED' });
    });

    it('blocks private 172.16.x.x IP', async () => {
      mockLookup.mockResolvedValue([{ address: '172.16.0.1', family: 4 }] as never);
      await expect(
        guardedFetch('https://arxiv.org/pdf/paper.pdf'),
      ).rejects.toMatchObject({ code: 'DNS_BLOCKED' });
    });

    it('blocks private 192.168.x.x IP', async () => {
      mockLookup.mockResolvedValue([{ address: '192.168.1.1', family: 4 }] as never);
      await expect(
        guardedFetch('https://arxiv.org/pdf/paper.pdf'),
      ).rejects.toMatchObject({ code: 'DNS_BLOCKED' });
    });

    it('blocks IPv6 loopback ::1', async () => {
      mockLookup.mockResolvedValue([{ address: '::1', family: 6 }] as never);
      await expect(
        guardedFetch('https://arxiv.org/pdf/paper.pdf'),
      ).rejects.toMatchObject({ code: 'DNS_BLOCKED' });
    });

    it('allows a public IP', async () => {
      mockLookup.mockResolvedValue([{ address: '151.101.1.1', family: 4 }] as never);
      const result = await guardedFetch('https://arxiv.org/pdf/paper.pdf');
      expect(result.status).toBe(200);
    });
  });

  describe('size cap', () => {
    it('rejects responses exceeding maxBytes', async () => {
      const bigBody = 'x'.repeat(100);
      const chunks = [Buffer.from(bigBody)];
      let idx = 0;
      const asyncBody = {
        [Symbol.asyncIterator]() {
          return {
            next: async () =>
              idx < chunks.length
                ? { value: chunks[idx++]!, done: false }
                : { value: undefined, done: true },
          };
        },
        destroy: vi.fn(),
      };
      mockRequest.mockResolvedValue({
        statusCode: 200,
        headers: { 'content-type': 'text/plain' },
        body: asyncBody,
      } as never);

      await expect(
        guardedFetch('https://arxiv.org/pdf/paper.pdf', { maxBytes: 50 }),
      ).rejects.toMatchObject({ code: 'TOO_LARGE' });
    });
  });

  describe('HTTP error codes', () => {
    it('throws on 404', async () => {
      mockRequest.mockResolvedValue({
        statusCode: 404,
        headers: {},
        body: {
          [Symbol.asyncIterator]() {
            return { next: async () => ({ value: undefined, done: true }) };
          },
          destroy: vi.fn(),
        },
      } as never);
      await expect(
        guardedFetch('https://arxiv.org/pdf/nonexistent'),
      ).rejects.toMatchObject({ code: 'HTTP_ERROR' });
    });

    it('throws on 500', async () => {
      mockRequest.mockResolvedValue({
        statusCode: 500,
        headers: {},
        body: {
          [Symbol.asyncIterator]() {
            return { next: async () => ({ value: undefined, done: true }) };
          },
          destroy: vi.fn(),
        },
      } as never);
      await expect(
        guardedFetch('https://arxiv.org/pdf/nonexistent'),
      ).rejects.toMatchObject({ code: 'HTTP_ERROR' });
    });
  });

  describe('successful fetch', () => {
    it('returns body, contentType, and status on success', async () => {
      mockRequest.mockResolvedValue(makeSuccessResponse('hello world', 'application/pdf') as never);
      const result = await guardedFetch('https://arxiv.org/pdf/2101.00001');
      expect(result.body.toString()).toBe('hello world');
      expect(result.contentType).toBe('application/pdf');
      expect(result.status).toBe(200);
    });
  });
});
