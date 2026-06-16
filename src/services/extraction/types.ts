import type { RetrievedPaper } from '../../models/retrievedPaper.js';
import type { StructuredDocument, GrobidUnavailableError } from '../../models/document.js';

export type { RetrievedPaper };

/**
 * Minimal async cache for StructuredDocument keyed by canonical id.
 * Satisfied by the persistence stream's SQLite/in-memory cache.
 */
export interface ExtractionCache {
  get(canonicalId: string): Promise<StructuredDocument | null>;
  set(canonicalId: string, doc: StructuredDocument): Promise<void>;
}

export type ExtractResult =
  | { ok: true; document: StructuredDocument }
  | { ok: false; error: GrobidUnavailableError };

/**
 * Core extraction interface.  GrobidExtractor is the production implementation;
 * tests may inject a stub that returns fixture StructuredDocuments.
 */
export interface Extractor {
  extract(paper: RetrievedPaper): Promise<ExtractResult>;
  /** Returns true if GROBID is reachable right now. */
  healthCheck(): Promise<boolean>;
}
