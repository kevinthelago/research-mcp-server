import type { StructuredDocument, GrobidUnavailableError } from '../../models/document.js';

/**
 * A minimal handle for an ingested paper as produced by the retrieval stream.
 * The retrieval stream owns RetrievedPaper; we mirror only what extraction needs.
 * Full type lives in src/models/retrieval.ts (retrieval stream).
 */
export interface RetrievedPaper {
  canonicalId: string;
  pdfPath: string | undefined;
  hasFullText: boolean;
  metadata: {
    title?: string;
    authors?: string[];
    abstract?: string;
    doi?: string;
    arxivId?: string;
    pmid?: string;
    pmcid?: string;
    year?: number;
    journal?: string;
  };
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
