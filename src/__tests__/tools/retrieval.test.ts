import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRetrievalTools, GetPaperInputSchema, IngestPdfInputSchema } from '../../tools/retrieval.js';
import type { PaperCache, BlobStore } from '../../contracts/persistence.js';
import type { SourceAdapter } from '../../contracts/search.js';

vi.mock('../../util/fetcher.js', () => ({
  guardedFetch: vi.fn().mockResolvedValue({
    body: Buffer.from('%PDF-1.4'),
    contentType: 'application/pdf',
    status: 200,
    url: 'https://arxiv.org/pdf/2101.00001',
  }),
  FetchError: class FetchError extends Error {
    constructor(message: string, public code: string) {
      super(message);
    }
  },
}));

vi.mock('file-type', () => ({
  fileTypeFromBuffer: vi.fn().mockResolvedValue({ mime: 'application/pdf' }),
}));

const DEFAULT_SOURCE_RESULT = { metadata: { title: 'Test Paper', year: 2021 } };

function makeDeps(overrides: {
  cacheGet?: (id: string) => Promise<ReturnType<PaperCache['get']>>;
  sourceResult?: Awaited<ReturnType<SourceAdapter['fetch']>>;
} = {}) {
  const cache: PaperCache = {
    get: vi.fn(async (id: string) => (overrides.cacheGet ? overrides.cacheGet(id) : null)),
    set: vi.fn(async () => {}),
  };
  const blobStore: BlobStore = {
    store: vi.fn(async (_buf: Buffer, sha256: string) => `/blobs/${sha256}.pdf`),
  };
  const resolvedResult = 'sourceResult' in overrides
    ? overrides.sourceResult
    : DEFAULT_SOURCE_RESULT;
  const source: SourceAdapter = {
    fetch: vi.fn(async () => resolvedResult ?? null),
  };
  return { cache, blobStore, sources: [source] };
}

describe('createRetrievalTools', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  describe('getPaper', () => {
    it('returns a result for a valid arXiv id', async () => {
      const deps = makeDeps();
      const { getPaper } = createRetrievalTools(deps);
      const result = await getPaper({ id: '2101.00001' });
      expect('canonicalId' in result).toBe(true);
      if ('canonicalId' in result) {
        expect(result.canonicalId).toBe('2101.00001');
        expect(result.source).toBe('arxiv');
      }
    });

    it('returns UNRECOGNIZED_ID error for garbage input', async () => {
      const deps = makeDeps();
      const { getPaper } = createRetrievalTools(deps);
      const result = await getPaper({ id: 'not an identifier at all' });
      expect('error' in result).toBe(true);
      if ('error' in result) {
        expect(result.code).toBe('UNRECOGNIZED_ID');
      }
    });

    it('returns NOT_FOUND when source returns null', async () => {
      const deps = makeDeps({ sourceResult: null });
      const { getPaper } = createRetrievalTools(deps);
      const result = await getPaper({ id: '2101.00001' });
      expect('error' in result).toBe(true);
      if ('error' in result) {
        expect(result.code).toBe('NOT_FOUND');
      }
    });

    it('validates input schema: id must be non-empty', () => {
      expect(() => GetPaperInputSchema.parse({ id: '' })).toThrow();
    });
  });

  describe('ingestPdf', () => {
    const VALID_PDF_HEADER = '%PDF-1.4 test';

    it('accepts base64 PDF content', async () => {
      const deps = makeDeps();
      const { ingestPdf } = createRetrievalTools(deps);
      const b64 = Buffer.from(VALID_PDF_HEADER).toString('base64');
      const result = await ingestPdf({ base64: b64, path: undefined });
      expect('canonicalId' in result).toBe(true);
      if ('canonicalId' in result) {
        expect(result.hasFullText).toBe(true);
        expect(result.source).toBe('user_upload');
      }
    });

    it('returns INVALID_PDF for non-PDF base64 content', async () => {
      const { fileTypeFromBuffer } = await import('file-type');
      vi.mocked(fileTypeFromBuffer).mockResolvedValue(undefined);

      const deps = makeDeps();
      const { ingestPdf } = createRetrievalTools(deps);
      const b64 = Buffer.from('not a pdf').toString('base64');
      const result = await ingestPdf({ base64: b64, path: undefined });
      expect('error' in result).toBe(true);
      if ('error' in result) {
        expect(result.code).toBe('INVALID_PDF');
      }
    });

    it('validates input schema: at least one of path or base64 required', () => {
      expect(() => IngestPdfInputSchema.parse({ path: '', base64: undefined })).toThrow();
    });
  });
});
