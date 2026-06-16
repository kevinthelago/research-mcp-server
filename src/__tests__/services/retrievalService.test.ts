import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RetrievalService, NotFoundError, UnrecognizedIdError } from '../../services/retrieval/retrievalService.js';
import type { PaperCache, BlobStore } from '../../contracts/persistence.js';
import type { SourceAdapter } from '../../contracts/search.js';
import type { RetrievedPaper } from '../../models/retrievedPaper.js';

// Mock the guarded fetcher to avoid real network calls
vi.mock('../../util/fetcher.js', () => ({
  guardedFetch: vi.fn(),
  FetchError: class FetchError extends Error {
    constructor(message: string, public code: string) {
      super(message);
    }
  },
}));

import { guardedFetch } from '../../util/fetcher.js';
const mockGuardedFetch = vi.mocked(guardedFetch);

function makeMockCache(initial?: RetrievedPaper): PaperCache {
  const store = new Map<string, RetrievedPaper>();
  if (initial != null) store.set(initial.canonicalId, initial);
  return {
    get: vi.fn(async (id: string) => store.get(id) ?? null),
    set: vi.fn(async (paper: RetrievedPaper) => { store.set(paper.canonicalId, paper); }),
  };
}

function makeMockBlobStore(): BlobStore {
  return {
    store: vi.fn(async (_buf: Buffer, sha256: string) => `/blobs/${sha256}.pdf`),
  };
}

function makeMockSource(result: Awaited<ReturnType<SourceAdapter['fetch']>>): SourceAdapter {
  return { fetch: vi.fn(async () => result) };
}

describe('RetrievalService', () => {
  let cache: PaperCache;
  let blobStore: BlobStore;

  beforeEach(() => {
    vi.clearAllMocks();
    cache = makeMockCache();
    blobStore = makeMockBlobStore();
  });

  describe('retrieve', () => {
    it('throws UnrecognizedIdError for unparseable input', async () => {
      const service = new RetrievalService({ cache, blobStore, sources: [] });
      await expect(service.retrieve('not an id at all')).rejects.toThrow(UnrecognizedIdError);
    });

    it('returns cached paper without calling sources', async () => {
      const cached: RetrievedPaper = {
        canonicalId: '2101.00001',
        metadata: { title: 'Cached Paper' },
        hasFullText: false,
        source: 'arxiv',
      };
      cache = makeMockCache(cached);
      const source = makeMockSource({ metadata: { title: 'From Source' } });
      const service = new RetrievalService({ cache, blobStore, sources: [source] });

      const result = await service.retrieve('2101.00001');
      expect(result.metadata.title).toBe('Cached Paper');
      expect(source.fetch).not.toHaveBeenCalled();
    });

    it('throws NotFoundError when no source resolves the id', async () => {
      const source = makeMockSource(null);
      const service = new RetrievalService({ cache, blobStore, sources: [source] });
      await expect(service.retrieve('2101.00001')).rejects.toThrow(NotFoundError);
    });

    it('returns paper with hasFullText=false when source has no OA PDF', async () => {
      const source = makeMockSource({ metadata: { title: 'Test Paper' } });
      const service = new RetrievalService({ cache, blobStore, sources: [source] });

      const result = await service.retrieve('2101.00001');
      expect(result.hasFullText).toBe(false);
      expect(result.pdfPath).toBeUndefined();
    });

    it('fetches OA PDF and sets hasFullText=true when URL is provided', async () => {
      const pdfBytes = Buffer.from('%PDF-1.4 minimal pdf');
      mockGuardedFetch.mockResolvedValue({
        body: pdfBytes,
        contentType: 'application/pdf',
        status: 200,
        url: 'https://arxiv.org/pdf/2101.00001',
      });

      const source = makeMockSource({
        metadata: { title: 'Test Paper' },
        openAccessPdfUrl: 'https://arxiv.org/pdf/2101.00001',
      });
      const service = new RetrievalService({ cache, blobStore, sources: [source] });

      const result = await service.retrieve('2101.00001');
      expect(result.hasFullText).toBe(true);
      expect(result.pdfPath).toBeDefined();
      expect(blobStore.store).toHaveBeenCalledWith(pdfBytes, expect.any(String));
    });

    it('sets hasFullText=false when OA PDF fetch fails', async () => {
      mockGuardedFetch.mockRejectedValue(new Error('network error'));
      const source = makeMockSource({
        metadata: { title: 'Test Paper' },
        openAccessPdfUrl: 'https://arxiv.org/pdf/2101.00001',
      });
      const service = new RetrievalService({ cache, blobStore, sources: [source] });

      const result = await service.retrieve('2101.00001');
      expect(result.hasFullText).toBe(false);
    });

    it('stores paper in cache after retrieval', async () => {
      const source = makeMockSource({ metadata: { title: 'Test Paper' } });
      const service = new RetrievalService({ cache, blobStore, sources: [source] });

      await service.retrieve('2101.00001');
      expect(cache.set).toHaveBeenCalledWith(
        expect.objectContaining({ canonicalId: '2101.00001', hasFullText: false }),
      );
    });

    it('tries sources in order and returns first match', async () => {
      const source1 = makeMockSource(null);
      const source2 = makeMockSource({ metadata: { title: 'From Source 2' } });
      const service = new RetrievalService({ cache, blobStore, sources: [source1, source2] });

      const result = await service.retrieve('2101.00001');
      expect(result.metadata.title).toBe('From Source 2');
      expect(source1.fetch).toHaveBeenCalled();
      expect(source2.fetch).toHaveBeenCalled();
    });

    it('assigns correct source type for arXiv ids', async () => {
      const source = makeMockSource({ metadata: {} });
      const service = new RetrievalService({ cache, blobStore, sources: [source] });
      const result = await service.retrieve('2101.00001');
      expect(result.source).toBe('arxiv');
    });

    it('assigns correct source type for DOIs', async () => {
      const source = makeMockSource({ metadata: {} });
      const service = new RetrievalService({ cache, blobStore, sources: [source] });
      const result = await service.retrieve('10.1038/nature12373');
      expect(result.source).toBe('crossref');
    });

    it('uses canonical id as cache key (strips arXiv version)', async () => {
      const source = makeMockSource({ metadata: { title: 'Test' } });
      const service = new RetrievalService({ cache, blobStore, sources: [source] });
      await service.retrieve('2101.00001v2');
      expect(cache.get).toHaveBeenCalledWith('2101.00001');
    });
  });
});
