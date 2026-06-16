import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createExtractionService } from '../index.js';
import type { Extractor, RetrievedPaper } from '../types.js';
import type { StructuredDocument } from '../../../models/document.js';

function makeDoc(canonicalId: string): StructuredDocument {
  return {
    canonicalId,
    metadata: { authors: [], keywords: [] },
    sections: [
      {
        id: 's1',
        title: 'Introduction',
        level: 1,
        paragraphs: ['Hello world.'],
        children: [
          {
            id: 's1.1',
            title: 'Subsection',
            level: 2,
            paragraphs: ['Sub para.'],
            children: [],
          },
        ],
      },
    ],
    references: [{ id: 'r1', rawText: 'Foo et al., 2020' }],
    figures: [{ id: 'f1', label: 'Figure 1', caption: 'A diagram.' }],
    tables: [{ id: 't1', label: 'Table 1', caption: 'Results.', content: 'a\tb' }],
    fullTextAvailable: true,
    extractionQuality: 'full',
  };
}

function makeStore(doc?: StructuredDocument) {
  const cache = new Map<string, unknown>();
  if (doc) cache.set(`extraction:doc:${doc.canonicalId}`, doc);
  return {
    cache: {
      get: vi.fn(async (key: string) => cache.get(key)),
      set: vi.fn(async (key: string, val: unknown) => { cache.set(key, val); }),
      has: vi.fn(async (key: string) => cache.has(key)),
      delete: vi.fn(),
      clear: vi.fn(),
    },
    papers: { get: vi.fn(), upsert: vi.fn(), list: vi.fn() },
    blobs: { save: vi.fn(), load: vi.fn(), exists: vi.fn(), path: vi.fn() },
    lancedb: { openTable: vi.fn(), createTable: vi.fn() },
  };
}

function makeLogger() {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

describe('ExtractionService.extractPaper', () => {
  it('returns noPdf when paper has no PDF', async () => {
    const svc = createExtractionService({
      extractor: { extract: vi.fn(), healthCheck: vi.fn().mockResolvedValue(true) } as Extractor,
      store: makeStore() as never,
      logger: makeLogger() as never,
    });
    const paper: RetrievedPaper = {
      canonicalId: 'p1',
      pdfPath: undefined,
      hasFullText: false,
      metadata: {},
    };
    const result = await svc.extractPaper(paper);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('NoPdfError');
  });

  it('returns cached document without calling extractor', async () => {
    const doc = makeDoc('p2');
    const extractor: Extractor = {
      extract: vi.fn(),
      healthCheck: vi.fn().mockResolvedValue(true),
    };
    const svc = createExtractionService({
      extractor,
      store: makeStore(doc) as never,
      logger: makeLogger() as never,
    });
    const paper: RetrievedPaper = {
      canonicalId: 'p2',
      pdfPath: '/some/path.pdf',
      hasFullText: true,
      metadata: {},
    };
    const result = await svc.extractPaper(paper);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.document.canonicalId).toBe('p2');
    expect(extractor.extract).not.toHaveBeenCalled();
  });

  it('calls extractor when not cached', async () => {
    const doc = makeDoc('p3');
    const extractor: Extractor = {
      extract: vi.fn().mockResolvedValue({ ok: true, document: doc }),
      healthCheck: vi.fn().mockResolvedValue(true),
    };
    const store = makeStore();
    const svc = createExtractionService({
      extractor,
      store: store as never,
      logger: makeLogger() as never,
    });
    const paper: RetrievedPaper = {
      canonicalId: 'p3',
      pdfPath: '/path.pdf',
      hasFullText: true,
      metadata: {},
    };
    const result = await svc.extractPaper(paper);
    expect(result.ok).toBe(true);
    expect(extractor.extract).toHaveBeenCalledOnce();
    expect(store.cache.set).toHaveBeenCalled();
  });

  it('returns grobidUnavailable when health check fails', async () => {
    const extractor: Extractor = {
      extract: vi.fn(),
      healthCheck: vi.fn().mockResolvedValue(false),
    };
    const svc = createExtractionService({
      extractor,
      store: makeStore() as never,
      logger: makeLogger() as never,
    });
    const paper: RetrievedPaper = {
      canonicalId: 'p4',
      pdfPath: '/path.pdf',
      hasFullText: true,
      metadata: {},
    };
    const result = await svc.extractPaper(paper);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('GrobidUnavailableError');
  });
});

describe('ExtractionService.getSection', () => {
  let svc: ReturnType<typeof createExtractionService>;
  const doc = makeDoc('p5');

  beforeEach(() => {
    svc = createExtractionService({
      extractor: { extract: vi.fn(), healthCheck: vi.fn() } as Extractor,
      store: makeStore() as never,
      logger: makeLogger() as never,
    });
  });

  it('returns a top-level section', () => {
    const result = svc.getSection(doc, 's1');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.section.title).toBe('Introduction');
  });

  it('returns a nested section', () => {
    const result = svc.getSection(doc, 's1.1');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.section.title).toBe('Subsection');
  });

  it('returns ElementNotFoundError for unknown id', () => {
    const result = svc.getSection(doc, 's99');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('ElementNotFoundError');
  });
});

describe('ExtractionService.getElement', () => {
  let svc: ReturnType<typeof createExtractionService>;
  const doc = makeDoc('p6');

  beforeEach(() => {
    svc = createExtractionService({
      extractor: { extract: vi.fn(), healthCheck: vi.fn() } as Extractor,
      store: makeStore() as never,
      logger: makeLogger() as never,
    });
  });

  it('returns a figure', () => {
    const result = svc.getElement(doc, 'f1');
    expect(result.ok).toBe(true);
    if (result.ok) expect((result.element as { label?: string }).label).toBe('Figure 1');
  });

  it('returns a table', () => {
    const result = svc.getElement(doc, 't1');
    expect(result.ok).toBe(true);
    if (result.ok) expect((result.element as { content?: string }).content).toBe('a\tb');
  });

  it('returns a reference', () => {
    const result = svc.getElement(doc, 'r1');
    expect(result.ok).toBe(true);
    if (result.ok) expect((result.element as { rawText: string }).rawText).toContain('Foo');
  });

  it('returns ElementNotFoundError for unknown id', () => {
    const result = svc.getElement(doc, 'f99');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('ElementNotFoundError');
  });
});
