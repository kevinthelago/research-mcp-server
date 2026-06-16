import { z } from 'zod';
import { StructuredDocumentSchema } from '../models/document.js';
import type { ExtractionService } from '../services/extraction/index.js';
import type { ExtractionCache, Extractor } from '../services/extraction/types.js';
import type { PaperCache } from '../contracts/persistence.js';
import { createExtractionService } from '../services/extraction/index.js';

// ---------------------------------------------------------------------------
// Input / output schemas
// ---------------------------------------------------------------------------

export const ExtractPaperInputSchema = z.object({
  canonicalId: z
    .string()
    .min(1)
    .describe('Canonical paper id returned by get_paper or ingest_pdf.'),
});
export type ExtractPaperInput = z.infer<typeof ExtractPaperInputSchema>;

export type ExtractPaperResult =
  | { kind: 'document'; document: z.infer<typeof StructuredDocumentSchema> }
  | { kind: 'noPdf'; canonicalId: string; message: string }
  | { kind: 'grobidUnavailable'; message: string; hint: string };

// ---------------------------------------------------------------------------
// Tool factory
// ---------------------------------------------------------------------------

export interface ExtractionToolDeps {
  extractor: Extractor;
  cache: ExtractionCache;
  /** PaperCache from the retrieval stream — used to look up the PDF path. */
  paperCache: PaperCache;
}

export function createExtractionTools(deps: ExtractionToolDeps) {
  const svc: ExtractionService = createExtractionService(deps);

  /**
   * `extract_paper` — run a retrieved paper through GROBID and return a
   * StructuredDocument (metadata, section tree, references, figures, tables).
   *
   * Results are cached by canonical id so repeated calls within the cache TTL
   * return instantly without re-extracting.
   *
   * Returns noPdf if the paper has no stored PDF (call ingest_pdf first).
   * Returns grobidUnavailable when the GROBID container is not running.
   */
  async function extractPaper(input: ExtractPaperInput): Promise<ExtractPaperResult> {
    const cached = await svc.getCachedDocument(input.canonicalId);
    if (cached) return { kind: 'document', document: cached };

    const paper = await deps.paperCache.get(input.canonicalId);
    if (!paper) {
      return {
        kind: 'noPdf',
        canonicalId: input.canonicalId,
        message: `Paper "${input.canonicalId}" not found. Use get_paper or ingest_pdf first.`,
      };
    }

    if (!paper.hasFullText || !paper.pdfPath) {
      return {
        kind: 'noPdf',
        canonicalId: input.canonicalId,
        message: `Paper "${input.canonicalId}" has no stored PDF. Use ingest_pdf to provide one.`,
      };
    }

    const result = await svc.extractPaper(paper);
    if (!result.ok) {
      const err = result.error;
      if (err.kind === 'GrobidUnavailableError') {
        return { kind: 'grobidUnavailable', message: err.message, hint: err.hint };
      }
      return { kind: 'noPdf', canonicalId: input.canonicalId, message: err.message };
    }

    return { kind: 'document', document: result.document };
  }

  return { extractPaper, svc };
}
