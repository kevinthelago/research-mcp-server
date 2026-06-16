/**
 * Local contract interfaces for citation stream.
 * These mirror what extraction/persistence/search streams will define —
 * align shapes on integration.
 */

/** A reference extracted from a document (e.g. by GROBID). */
export interface ParsedReference {
  /** Raw string as extracted from the source document */
  rawString: string;
  title?: string;
  authors?: string[];
  year?: number;
  /** Pre-extracted DOI (short-circuits resolution if present) */
  doi?: string;
  /** Pre-extracted arXiv ID (short-circuits resolution if present) */
  arxivId?: string;
  /** Canonical identifier after resolution, e.g. "doi:10.xxx", "arxiv:2301.xxx" */
  resolvedId: string | null;
  /** Confidence score 0..1 (0 = unresolved / unknown) */
  confidence: number;
}

/**
 * Minimal StructuredDocument shape consumed by citation stream.
 * Owned by extraction (src/models/document.ts) — verify alignment on integration.
 */
export interface StructuredDocument {
  id: string;
  references: ParsedReference[];
}

/** Input query passed to search adapters */
export interface ReferenceQuery {
  title?: string;
  authors?: string[];
  year?: number;
  doi?: string;
  rawString?: string;
}

/** A resolution candidate returned by a search adapter */
export interface AdapterCandidate {
  /** Canonical identifier, e.g. "doi:10.xxx/xxx", "arxiv:2301.xxxxx" */
  id: string;
  title?: string;
  authors?: string[];
  year?: number;
}

/**
 * Contract for search adapters (CrossrefAdapter / SemanticScholarAdapter).
 * Owned by search stream (src/sources/) — verify method signature on integration.
 */
export interface ISearchAdapter {
  resolve(query: ReferenceQuery): Promise<AdapterCandidate[]>;
}

/**
 * Contract for the document store.
 * Owned by persistence stream (src/store/) — verify on integration.
 */
export interface IDocumentStore {
  getDocument(id: string): Promise<StructuredDocument | null>;
  updateDocumentReferences(id: string, references: ParsedReference[]): Promise<void>;
}

export interface CitationConfig {
  /** Minimum score to accept a candidate; default 0.75 */
  confidenceThreshold?: number;
}

export interface ReferenceResolution {
  reference: ParsedReference;
  resolvedId: string | null;
  confidence: number;
  status: 'resolved' | 'unresolved' | 'error';
  error?: string;
}
