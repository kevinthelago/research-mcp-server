import { describe, it, expect } from 'vitest';
import { Chunker } from '../../../services/rag/chunker.js';
import type { StructuredDocument } from '../../../contracts/extraction.js';

function makeDoc(overrides: Partial<StructuredDocument> = {}): StructuredDocument {
  return {
    paperId: 'paper-123',
    metadata: { title: 'Test Paper', authors: ['A. Author'] },
    sections: [],
    ...overrides,
  };
}

const SHORT_TEXT = 'This is a short section with very few tokens.';
const LONG_TEXT = Array(80).fill('A sentence with about ten tokens here now.').join('\n\n');

describe('Chunker', () => {
  it('returns empty array for a document with no content', () => {
    const chunker = new Chunker();
    expect(chunker.chunk(makeDoc())).toEqual([]);
  });

  it('emits abstract as a chunk with sectionId="abstract"', () => {
    const chunker = new Chunker();
    const doc = makeDoc({ metadata: { title: 'T', authors: [], abstract: 'This is the abstract.' } });
    const chunks = chunker.chunk(doc);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.sectionId).toBe('abstract');
    expect(chunks[0]?.sectionTitle).toBe('Abstract');
    expect(chunks[0]?.paperId).toBe('paper-123');
  });

  it('produces one chunk when section fits in targetTokens', () => {
    const chunker = new Chunker({ targetTokens: 256 });
    const doc = makeDoc({
      sections: [{ id: 's1', title: 'Introduction', content: SHORT_TEXT }],
    });
    const chunks = chunker.chunk(doc);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.sectionId).toBe('s1');
    expect(chunks[0]?.sectionTitle).toBe('Introduction');
    expect(chunks[0]?.charStart).toBe(0);
    expect(chunks[0]?.charEnd).toBe(SHORT_TEXT.length);
  });

  it('splits a long section into multiple overlapping chunks', () => {
    const chunker = new Chunker({ targetTokens: 50, overlapTokens: 10 });
    const doc = makeDoc({
      sections: [{ id: 's1', title: 'Methods', content: LONG_TEXT }],
    });
    const chunks = chunker.chunk(doc);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.sectionId === 's1')).toBe(true);
    for (const c of chunks) {
      expect(c.charStart).toBeGreaterThanOrEqual(0);
      expect(c.charEnd).toBeLessThanOrEqual(LONG_TEXT.length);
      expect(c.charStart).toBeLessThan(c.charEnd);
    }
  });

  it('assigns deterministic IDs (same input → same IDs)', () => {
    const chunker = new Chunker({ targetTokens: 50, overlapTokens: 10 });
    const doc = makeDoc({ sections: [{ id: 's1', title: 'Intro', content: LONG_TEXT }] });
    const a = chunker.chunk(doc).map((c) => c.id);
    const b = chunker.chunk(doc).map((c) => c.id);
    expect(a).toEqual(b);
  });

  it('chunk IDs are unique within a document', () => {
    const chunker = new Chunker({ targetTokens: 50, overlapTokens: 10 });
    const doc = makeDoc({ sections: [{ id: 's1', title: 'Body', content: LONG_TEXT }] });
    const ids = chunker.chunk(doc).map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('records correct tokenCount on each chunk', async () => {
    const { encode } = await import('gpt-tokenizer');
    const chunker = new Chunker({ targetTokens: 100, overlapTokens: 20 });
    const doc = makeDoc({ sections: [{ id: 's1', title: 'Body', content: LONG_TEXT }] });
    for (const chunk of chunker.chunk(doc)) {
      expect(chunk.tokenCount).toBe(encode(chunk.text).length);
    }
  });

  it('processes subsections', () => {
    const chunker = new Chunker();
    const doc = makeDoc({
      sections: [
        {
          id: 's1',
          title: 'Results',
          content: 'Top-level content.',
          subsections: [{ id: 's1.1', title: 'Sub-result', content: SHORT_TEXT }],
        },
      ],
    });
    const chunks = chunker.chunk(doc);
    const sectionIds = chunks.map((c) => c.sectionId);
    expect(sectionIds).toContain('s1');
    expect(sectionIds).toContain('s1.1');
  });

  it('respects targetTokens — no chunk exceeds the limit by much', () => {
    const target = 60;
    const chunker = new Chunker({ targetTokens: target, overlapTokens: 10 });
    const doc = makeDoc({ sections: [{ id: 's1', title: 'X', content: LONG_TEXT }] });
    for (const chunk of chunker.chunk(doc)) {
      expect(chunk.tokenCount).toBeLessThanOrEqual(target * 2);
    }
  });
});
