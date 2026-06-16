import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import * as lancedb from '@lancedb/lancedb';
import { RagIndex } from '../../../services/rag/ragIndex.js';
import type { Embedder } from '../../../services/rag/embedder.js';
import type { StructuredDocument } from '../../../contracts/extraction.js';

function makeEmbedder(dim = 8): Embedder {
  return {
    dim,
    modelId: 'test/mock-embedder',
    async embed(texts) {
      return texts.map((t, i) =>
        Array.from({ length: dim }, (_, j) => ((t.length + i + j) % 10) / 10),
      );
    },
  };
}

function makeDoc(paperId: string, numSections = 2): StructuredDocument {
  return {
    paperId,
    metadata: { title: `Paper ${paperId}`, authors: ['Author'], abstract: `Abstract for ${paperId}.` },
    sections: Array.from({ length: numSections }, (_, i) => ({
      id: `${paperId}-s${i + 1}`,
      title: `Section ${i + 1}`,
      content: `Content of section ${i + 1} for paper ${paperId}. It has some text to chunk.`,
    })),
  };
}

let tmpDir: string;
let getDb: () => Promise<lancedb.Connection>;

beforeAll(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'test-ragindex-'));
  const db = await lancedb.connect(tmpDir);
  getDb = async () => db;
});

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('RagIndex', () => {
  it('indexes a document and returns chunk count > 0', async () => {
    const idx = new RagIndex(makeEmbedder(), getDb);
    const doc = makeDoc('p1');
    const count = await idx.index(doc);
    expect(count).toBeGreaterThan(0);
  });

  it('stores and retrieves chunks via search', async () => {
    const idx = new RagIndex(makeEmbedder(), getDb);
    const doc = makeDoc('p2');
    await idx.index(doc);

    const { results } = await idx.search('content of section', { paperIds: ['p2'] }, 10);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]).toMatchObject({
      paperId: 'p2',
      score: expect.any(Number),
      text: expect.any(String),
    });
  });

  it('is idempotent — re-indexing the same paper does not duplicate chunks', async () => {
    const idx = new RagIndex(makeEmbedder(), getDb);
    const doc = makeDoc('p3');

    const count1 = await idx.index(doc);
    const count2 = await idx.index(doc);
    expect(count1).toBe(count2);

    const { results } = await idx.search('section', { paperIds: ['p3'] }, 100);
    expect(results.length).toBeLessThanOrEqual(count1);
  });

  it('scopes search to specified paper IDs', async () => {
    const idx = new RagIndex(makeEmbedder(), getDb);
    await idx.index(makeDoc('pA'));
    await idx.index(makeDoc('pB'));

    const { results } = await idx.search('section content', { paperIds: ['pA'] }, 50);
    const ids = [...new Set(results.map((r) => r.paperId))];
    expect(ids).toEqual(['pA']);
  });

  it('returns empty result + note for empty paperIds scope', async () => {
    const idx = new RagIndex(makeEmbedder(), getDb);
    const { results, note } = await idx.search('anything', { paperIds: [] });
    expect(results).toEqual([]);
    expect(note).toBeDefined();
    expect(note).toContain('No papers in scope');
  });

  it('returns empty result + note when no papers indexed yet', async () => {
    const freshDir = mkdtempSync(join(tmpdir(), 'test-ragindex-fresh-'));
    const freshDb = await lancedb.connect(freshDir);
    try {
      const idx = new RagIndex(makeEmbedder(), async () => freshDb);
      const { results, note } = await idx.search('query');
      expect(results).toEqual([]);
      expect(note).toContain('No papers');
    } finally {
      rmSync(freshDir, { recursive: true, force: true });
    }
  });

  it('search results are sorted by descending score (best first)', async () => {
    const idx = new RagIndex(makeEmbedder(), getDb);
    await idx.index(makeDoc('pScore'));

    const { results } = await idx.search('section', undefined, 10);
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1]!.score).toBeGreaterThanOrEqual(results[i]!.score);
    }
  });

  it('respects topK limit', async () => {
    const idx = new RagIndex(makeEmbedder(), getDb);
    await idx.index(makeDoc('pTopK', 5));

    const { results } = await idx.search('section', undefined, 2);
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it('includes provenance metadata in results', async () => {
    const idx = new RagIndex(makeEmbedder(), getDb);
    const doc = makeDoc('pProv');
    await idx.index(doc);

    const { results } = await idx.search('content', { paperIds: ['pProv'] }, 5);
    expect(results.length).toBeGreaterThan(0);
    const r = results[0]!;
    expect(r).toHaveProperty('chunkId');
    expect(r).toHaveProperty('paperId', 'pProv');
    expect(r).toHaveProperty('sectionId');
    expect(r).toHaveProperty('sectionTitle');
    expect(r).toHaveProperty('charStart');
    expect(r).toHaveProperty('charEnd');
    expect(r.charEnd).toBeGreaterThan(r.charStart);
  });
});
