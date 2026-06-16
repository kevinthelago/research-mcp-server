import type { NormalizedId } from '../util/identifiers.js';
import type { PaperMetadata } from '../models/retrievedPaper.js';

export interface SourceResult {
  metadata: PaperMetadata;
  /** URL to an open-access PDF, if available */
  openAccessPdfUrl?: string;
}

/** Adapter for a single bibliographic source (arXiv, Crossref, PubMed, etc.). */
export interface SourceAdapter {
  /**
   * Fetch metadata (and optionally an OA PDF URL) for the given normalized ID.
   * Returns null when the source does not recognize the identifier.
   */
  fetch(id: NormalizedId): Promise<SourceResult | null>;
}
