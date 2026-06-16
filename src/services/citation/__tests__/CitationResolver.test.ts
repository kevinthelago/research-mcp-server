import { describe, it, expect, vi } from 'vitest';
import { CitationResolver, referenceHash } from '../CitationResolver.js';
import type { ISearchAdapter, ParsedReference } from '../types.js';

function makeAdapter(candidates: object[] = []): ISearchAdapter {
  return { resolve: vi.fn().mockResolvedValue(candidates) };
}

function makeRef(overrides: Partial<ParsedReference> = {}): ParsedReference {
  return { rawString: 'test ref', resolvedId: null, confidence: 0, ...overrides };
}

describe('CitationResolver', () => {
  describe('resolveOne', () => {
    it('short-circuits on pre-existing DOI without calling adapters', async () => {
      const crossref = makeAdapter();
      const s2 = makeAdapter();
      const resolver = new CitationResolver(crossref, s2);

      const result = await resolver.resolveOne(makeRef({ doi: '10.5555/abc' }));

      expect(result.resolvedId).toBe('doi:10.5555/abc');
      expect(result.confidence).toBe(1.0);
      expect(result.status).toBe('resolved');
      expect(crossref.resolve).not.toHaveBeenCalled();
    });

    it('short-circuits on pre-existing arxivId', async () => {
      const resolver = new CitationResolver(makeAdapter(), makeAdapter());
      const result = await resolver.resolveOne(makeRef({ arxivId: '2301.12345' }));
      expect(result.resolvedId).toBe('arxiv:2301.12345');
      expect(result.confidence).toBe(1.0);
    });

    it('resolves when best candidate exceeds threshold', async () => {
      const crossref = makeAdapter([{
        id: 'doi:10.5555/vaswani',
        title: 'Attention Is All You Need',
        authors: ['Vaswani', 'Shazeer'],
        year: 2017,
      }]);
      const resolver = new CitationResolver(crossref, makeAdapter(), { confidenceThreshold: 0.7 });

      const result = await resolver.resolveOne(
        makeRef({ title: 'Attention Is All You Need', authors: ['Vaswani', 'Shazeer'], year: 2017 }),
      );

      expect(result.resolvedId).toBe('doi:10.5555/vaswani');
      expect(result.confidence).toBeGreaterThan(0.7);
      expect(result.status).toBe('resolved');
    });

    it('returns null when best candidate is below threshold', async () => {
      const crossref = makeAdapter([{ id: 'doi:10.5555/bad', title: 'Completely Different Paper', year: 2010 }]);
      const resolver = new CitationResolver(crossref, makeAdapter(), { confidenceThreshold: 0.7 });

      const result = await resolver.resolveOne(
        makeRef({ title: 'Attention Is All You Need', year: 2017 }),
      );

      expect(result.resolvedId).toBeNull();
      expect(result.status).toBe('unresolved');
    });

    it('returns unresolved when both adapters return empty', async () => {
      const resolver = new CitationResolver(makeAdapter([]), makeAdapter([]));
      const result = await resolver.resolveOne(makeRef({ title: 'Some Paper' }));
      expect(result.resolvedId).toBeNull();
      expect(result.status).toBe('unresolved');
    });

    it('merges candidates from both adapters and picks the best', async () => {
      const crossref = makeAdapter([{
        id: 'doi:10.5555/worse',
        title: 'Attention Is All You Need — Workshop Version',
        year: 2017,
      }]);
      const s2 = makeAdapter([{
        id: 'doi:10.5555/better',
        title: 'Attention Is All You Need',
        authors: ['Vaswani'],
        year: 2017,
      }]);
      const resolver = new CitationResolver(crossref, s2, { confidenceThreshold: 0.5 });

      const result = await resolver.resolveOne(
        makeRef({ title: 'Attention Is All You Need', year: 2017 }),
      );

      expect(result.resolvedId).toBe('doi:10.5555/better');
    });

    it('returns unresolved (not error) when both adapters reject', async () => {
      const failing: ISearchAdapter = { resolve: vi.fn().mockRejectedValue(new Error('net error')) };
      const resolver = new CitationResolver(failing, failing);

      const result = await resolver.resolveOne(makeRef({ title: 'Some Paper' }));
      expect(result.status).toBe('unresolved');
      expect(result.resolvedId).toBeNull();
    });
  });

  describe('resolveAll', () => {
    it('resolves multiple references independently', async () => {
      const crossref = makeAdapter([
        { id: 'doi:10.5555/a', title: 'Paper A', year: 2020 },
        { id: 'doi:10.5555/b', title: 'Paper B', year: 2021 },
      ]);
      const resolver = new CitationResolver(crossref, makeAdapter(), { confidenceThreshold: 0.5 });

      const results = await resolver.resolveAll([
        makeRef({ title: 'Paper A', year: 2020 }),
        makeRef({ title: 'Paper B', year: 2021 }),
      ]);

      expect(results).toHaveLength(2);
      expect(results[0]?.status).toBe('resolved');
      expect(results[1]?.status).toBe('resolved');
    });

    it('does not abort the batch when one reference errors', async () => {
      let callCount = 0;
      const adapter: ISearchAdapter = {
        resolve: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) return Promise.reject(new Error('fail'));
          return Promise.resolve([{ id: 'doi:10.5555/ok', title: 'Paper B', year: 2021 }]);
        }),
      };
      const resolver = new CitationResolver(adapter, makeAdapter(), { confidenceThreshold: 0.5 });

      const results = await resolver.resolveAll([
        makeRef({ title: 'Paper A', year: 2020 }),
        makeRef({ title: 'Paper B', year: 2021 }),
      ]);

      expect(results).toHaveLength(2);
      // One may be error/unresolved, second should be fine
      const statuses = results.map(r => r.status);
      expect(statuses).toContain('resolved');
    });

    it('returns empty array for empty input', async () => {
      const resolver = new CitationResolver(makeAdapter(), makeAdapter());
      expect(await resolver.resolveAll([])).toEqual([]);
    });
  });

  describe('referenceHash', () => {
    it('is stable for the same reference', () => {
      const r = makeRef({ title: 'A paper', authors: ['Smith'], year: 2020 });
      expect(referenceHash(r)).toBe(referenceHash(r));
    });

    it('is different for different references', () => {
      const r1 = makeRef({ title: 'Paper A' });
      const r2 = makeRef({ title: 'Paper B' });
      expect(referenceHash(r1)).not.toBe(referenceHash(r2));
    });

    it('is stable regardless of author array order', () => {
      const r1 = makeRef({ authors: ['Smith', 'Jones'] });
      const r2 = makeRef({ authors: ['Jones', 'Smith'] });
      expect(referenceHash(r1)).toBe(referenceHash(r2));
    });

    it('returns a 16-char hex string', () => {
      expect(referenceHash(makeRef())).toMatch(/^[0-9a-f]{16}$/);
    });
  });
});
