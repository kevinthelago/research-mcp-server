import { z } from 'zod';
import { RetrievalService, NotFoundError, UnrecognizedIdError } from '../services/retrieval/retrievalService.js';
import { IngestService, InvalidPdfError, PdfTooLargeError } from '../services/retrieval/ingestService.js';
import type { PaperCache, BlobStore } from '../contracts/persistence.js';
import type { SourceAdapter } from '../contracts/search.js';
import type { PaperMetadata } from '../models/retrievedPaper.js';

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

export const GetPaperInputSchema = z.object({
  id: z.string().min(1).describe(
    'Paper identifier: DOI, arXiv ID (e.g. 2101.00001), PMID, PMCID, or a DOI/PubMed/arXiv URL',
  ),
});
export type GetPaperInput = z.infer<typeof GetPaperInputSchema>;

export const IngestPdfInputSchema = z
  .object({
    path: z
      .string()
      .min(1)
      .optional()
      .describe('Absolute path to a PDF file on the local filesystem. Mutually exclusive with base64.'),
    base64: z
      .string()
      .min(1)
      .optional()
      .describe('Base64-encoded PDF content. Mutually exclusive with path.'),
  })
  .refine(
    ({ path, base64 }) => (path != null) !== (base64 != null),
    { message: 'Exactly one of path or base64 must be provided' },
  );
export type IngestPdfInput = z.infer<typeof IngestPdfInputSchema>;

// ---------------------------------------------------------------------------
// Tool result shape (mirrors RetrievedPaper for MCP callers)
// ---------------------------------------------------------------------------

export interface GetPaperResult {
  canonicalId: string;
  metadata: PaperMetadata;
  pdfPath?: string;
  hasFullText: boolean;
  source: string;
}

export interface ToolError {
  error: string;
  code: 'NOT_FOUND' | 'UNRECOGNIZED_ID' | 'INVALID_PDF' | 'PDF_TOO_LARGE' | 'INTERNAL';
}

// ---------------------------------------------------------------------------
// Tool factory — takes dependencies and returns handler functions
// ---------------------------------------------------------------------------

export interface RetrievalToolDeps {
  cache: PaperCache;
  blobStore: BlobStore;
  sources: SourceAdapter[];
}

export function createRetrievalTools(deps: RetrievalToolDeps) {
  const retrievalService = new RetrievalService(deps);
  const ingestService = new IngestService({ blobStore: deps.blobStore });

  /**
   * `get_paper` — resolve an identifier to metadata + optional PDF.
   *
   * Returns a GetPaperResult on success, or a ToolError with a typed error code
   * on known failure modes. Unknown errors are re-thrown.
   */
  async function getPaper(input: GetPaperInput): Promise<GetPaperResult | ToolError> {
    try {
      const paper = await retrievalService.retrieve(input.id);
      return {
        canonicalId: paper.canonicalId,
        metadata: paper.metadata,
        ...(paper.pdfPath != null ? { pdfPath: paper.pdfPath } : {}),
        hasFullText: paper.hasFullText,
        source: paper.source,
      };
    } catch (err) {
      if (err instanceof UnrecognizedIdError) {
        return { error: err.message, code: 'UNRECOGNIZED_ID' };
      }
      if (err instanceof NotFoundError) {
        return { error: err.message, code: 'NOT_FOUND' };
      }
      throw err;
    }
  }

  /**
   * `ingest_pdf` — accept a local path or base64 bytes, validate, store, return RetrievedPaper.
   *
   * Returns a GetPaperResult on success, or a ToolError on known validation failures.
   */
  async function ingestPdf(input: IngestPdfInput): Promise<GetPaperResult | ToolError> {
    try {
      const paper = input.base64 != null
        ? await ingestService.ingestBase64(input.base64)
        : await ingestService.ingest(input.path!);

      return {
        canonicalId: paper.canonicalId,
        metadata: paper.metadata,
        ...(paper.pdfPath != null ? { pdfPath: paper.pdfPath } : {}),
        hasFullText: paper.hasFullText,
        source: paper.source,
      };
    } catch (err) {
      if (err instanceof InvalidPdfError) {
        return { error: err.message, code: 'INVALID_PDF' };
      }
      if (err instanceof PdfTooLargeError) {
        return { error: err.message, code: 'PDF_TOO_LARGE' };
      }
      throw err;
    }
  }

  return { getPaper, ingestPdf };
}
