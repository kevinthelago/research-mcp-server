export { GrobidExtractor } from './grobidExtractor.js';
export type { GrobidExtractorOptions } from './grobidExtractor.js';
export type { Extractor, ExtractResult, RetrievedPaper } from './types.js';

import type { Store } from '../../store/index.js';
import type { Logger } from '../../logger.js';
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
import type { Extractor, RetrievedPaper } from './types.js';

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const CACHE_KEY_PREFIX = 'extraction:doc:';

export interface ExtractionService {
  /** Extract a paper and cache the result. */
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

export function createExtractionService(opts: {
  extractor: Extractor;
  store: Store;
  logger: Logger;
}): ExtractionService {
  const { extractor, store, logger } = opts;

  async function extractPaper(paper: RetrievedPaper) {
    if (!paper.hasFullText || !paper.pdfPath) {
      return { ok: false as const, error: makeNoPdfError(paper.canonicalId) };
    }

    // Check cache first
    const cached = await getCachedDocument(paper.canonicalId);
    if (cached) {
      logger.debug({ canonicalId: paper.canonicalId }, 'extraction cache hit');
      return { ok: true as const, document: cached };
    }

    // Check GROBID health before attempting extraction
    const healthy = await extractor.healthCheck();
    if (!healthy) {
      logger.warn('GROBID health check failed before extraction');
      return { ok: false as const, error: makeGrobidUnavailableError() };
    }

    const result = await extractor.extract(paper);
    if (!result.ok) {
      return result;
    }

    // Persist to cache
    await store.cache.set(
      `${CACHE_KEY_PREFIX}${paper.canonicalId}`,
      result.document,
      CACHE_TTL_MS,
    );
    logger.info({ canonicalId: paper.canonicalId }, 'extraction complete, cached');

    return result;
  }

  async function getCachedDocument(canonicalId: string): Promise<StructuredDocument | undefined> {
    const raw = await store.cache.get<unknown>(`${CACHE_KEY_PREFIX}${canonicalId}`);
    if (!raw) return undefined;
    const parsed = StructuredDocumentSchema.safeParse(raw);
    if (!parsed.success) return undefined;
    return parsed.data;
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

    return { ok: false as const, error: makeElementNotFoundError(elementId, doc.canonicalId) };
  }

  return { extractPaper, getCachedDocument, getSection, getElement };
}
