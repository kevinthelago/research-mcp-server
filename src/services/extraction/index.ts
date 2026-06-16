// GrobidExtractor is NOT re-exported here so tests importing createExtractionService
// don't pull in undici transitively. Import it directly from './grobidExtractor.js'.
export type { Extractor, ExtractResult, ExtractionCache, RetrievedPaper } from './types.js';

import {
  findSection,
  makeElementNotFoundError,
  makeGrobidUnavailableError,
  makeNoPdfError,
  StructuredDocumentSchema,
} from '../../models/document.js';
import type {
  ElementNotFoundError,
  Figure,
  GrobidUnavailableError,
  NoPdfError,
  Reference,
  Section,
  StructuredDocument,
  Table,
} from '../../models/document.js';
import type { Extractor, ExtractionCache, RetrievedPaper } from './types.js';

export interface ExtractionServiceDeps {
  extractor: Extractor;
  cache: ExtractionCache;
}

export interface ExtractionService {
  /** Extract a paper via GROBID and cache the result. */
  extractPaper(
    paper: RetrievedPaper,
  ): Promise<
    | { ok: true; document: StructuredDocument }
    | { ok: false; error: NoPdfError | GrobidUnavailableError }
  >;

  /** Load a cached document by canonical id. Returns undefined if not cached. */
  getCachedDocument(canonicalId: string): Promise<StructuredDocument | undefined>;

  /** Return one section subtree; error if not found. */
  getSection(
    doc: StructuredDocument,
    sectionId: string,
  ): { ok: true; section: Section } | { ok: false; error: ElementNotFoundError };

  /** Return one figure, table, or reference; error if not found. */
  getElement(
    doc: StructuredDocument,
    elementId: string,
  ):
    | { ok: true; element: Figure | Table | Reference }
    | { ok: false; error: ElementNotFoundError };
}

export function createExtractionService(deps: ExtractionServiceDeps): ExtractionService {
  const { extractor, cache } = deps;

  async function extractPaper(paper: RetrievedPaper) {
    if (!paper.hasFullText || !paper.pdfPath) {
      return { ok: false as const, error: makeNoPdfError(paper.canonicalId) };
    }

    const cached = await getCachedDocument(paper.canonicalId);
    if (cached) return { ok: true as const, document: cached };

    const healthy = await extractor.healthCheck();
    if (!healthy) {
      return { ok: false as const, error: makeGrobidUnavailableError() };
    }

    const result = await extractor.extract(paper);
    if (!result.ok) return result;

    await cache.set(paper.canonicalId, result.document);
    return result;
  }

  async function getCachedDocument(canonicalId: string): Promise<StructuredDocument | undefined> {
    const raw = await cache.get(canonicalId);
    if (!raw) return undefined;
    const parsed = StructuredDocumentSchema.safeParse(raw);
    return parsed.success ? parsed.data : undefined;
  }

  function getSection(doc: StructuredDocument, sectionId: string) {
    const section = findSection(doc.sections, sectionId);
    if (!section) {
      return { ok: false as const, error: makeElementNotFoundError(sectionId, doc.canonicalId) };
    }
    return { ok: true as const, section };
  }

  function getElement(doc: StructuredDocument, elementId: string) {
    const figure = doc.figures.find((f) => f.id === elementId);
    if (figure) return { ok: true as const, element: figure };

    const table = doc.tables.find((t) => t.id === elementId);
    if (table) return { ok: true as const, element: table };

    const ref = doc.references.find((r) => r.id === elementId);
    if (ref) return { ok: true as const, element: ref };

    return {
      ok: false as const,
      error: makeElementNotFoundError(elementId, doc.canonicalId),
    };
  }

  return { extractPaper, getCachedDocument, getSection, getElement };
}
