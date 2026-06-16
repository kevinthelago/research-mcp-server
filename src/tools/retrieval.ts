import { z } from 'zod';
import { RetrievalService, NotFoundError, UnrecognizedIdError } from '../services/retrieval/retrievalService.js';
import { IngestService, InvalidPdfError, PdfTooLargeError } from '../services/retrieval/ingestService.js';
import type { PaperCache, BlobStore } from '../contracts/persistence.js';
import type { SourceAdapter } from '../contracts/search.js';
import type { PaperMetadata } from '../models/retrievedPaper.js';

// ---------------------------------------------------------------------------
// Input schemas — exported as both raw ZodShape (for registerTool) and
// z.object (for gen:tool-docs and direct validation)
// ---------------------------------------------------------------------------

export const getPaperInputShape = {
  id: z.string().min(1).describe(
    'Paper identifier: DOI, arXiv ID (e.g. 2101.00001), PMID, PMCID, or a DOI/PubMed/arXiv URL',
  ),
};

export const GetPaperInputSchema = z.object(getPaperInputShape);
export type GetPaperInput = z.infer<typeof GetPaperInputSchema>;

export const ingestPdfInputShape = {
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
};

export const IngestPdfInputSchema = z
  .object(ingestPdfInputShape)
  .refine(
    ({ path, base64 }) => (path != null) !== (base64 != null),
    { message: 'Exactly one of path or base64 must be provided' },
  );
export type IngestPdfInput = z.infer<typeof IngestPdfInputSchema>;

// ---------------------------------------------------------------------------
// Result types
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

type McpContent = { content: Array<{ type: 'text'; text: string }> };

function ok(result: unknown): McpContent {
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
}

function err(code: ToolError['code'], message: string): McpContent {
  return ok({ error: message, code } satisfies ToolError);
}

// ---------------------------------------------------------------------------
// Context expected by retrieval tools when registered via registerTool
// ---------------------------------------------------------------------------

export interface RetrievalContext {
  store: {
    papers: PaperCache;
    blobs: BlobStore;
  };
  services: {
    sources: SourceAdapter[];
  };
  logger: { error: (...args: unknown[]) => void };
}

// ---------------------------------------------------------------------------
// Tool definitions (server-core ToolDef format)
// ---------------------------------------------------------------------------

export const getPaperToolDef = {
  name: 'get_paper',
  description:
    'Resolve a paper identifier (DOI, arXiv ID, PMID, PMCID, or URL) to metadata and, ' +
    'when an open-access PDF is available, download and cache it. ' +
    'Returns hasFullText=false when no PDF is available — this is not an error. ' +
    'Returns a typed error with code NOT_FOUND when no source recognises the identifier.',
  inputSchema: getPaperInputShape,
  handler: async (input: GetPaperInput, ctx: RetrievalContext): Promise<McpContent> => {
    const service = new RetrievalService({
      cache: ctx.store.papers,
      blobStore: ctx.store.blobs,
      sources: ctx.services.sources,
    });
    try {
      const paper = await service.retrieve(input.id);
      return ok({
        canonicalId: paper.canonicalId,
        metadata: paper.metadata,
        ...(paper.pdfPath != null ? { pdfPath: paper.pdfPath } : {}),
        hasFullText: paper.hasFullText,
        source: paper.source,
      } satisfies GetPaperResult);
    } catch (e) {
      if (e instanceof UnrecognizedIdError) return err('UNRECOGNIZED_ID', e.message);
      if (e instanceof NotFoundError) return err('NOT_FOUND', e.message);
      ctx.logger.error('get_paper error', e);
      return err('INTERNAL', e instanceof Error ? e.message : 'Unknown error');
    }
  },
} as const;

export const ingestPdfToolDef = {
  name: 'ingest_pdf',
  description:
    'Ingest a PDF by filesystem path or base64-encoded bytes. ' +
    'Validates PDF magic bytes, enforces a 200 MB size cap, stores content in the blob store, ' +
    'and mints a content-sha256 canonical ID (idempotent — same bytes always yield the same ID). ' +
    'Returns hasFullText=true.',
  inputSchema: ingestPdfInputShape,
  handler: async (input: GetPaperInput & { path?: string; base64?: string }, ctx: RetrievalContext): Promise<McpContent> => {
    const service = new IngestService({ blobStore: ctx.store.blobs });
    try {
      const paper = input.base64 != null
        ? await service.ingestBase64(input.base64)
        : await service.ingest(input.path!);
      return ok({
        canonicalId: paper.canonicalId,
        metadata: paper.metadata,
        ...(paper.pdfPath != null ? { pdfPath: paper.pdfPath } : {}),
        hasFullText: paper.hasFullText,
        source: paper.source,
      } satisfies GetPaperResult);
    } catch (e) {
      if (e instanceof InvalidPdfError) return err('INVALID_PDF', e.message);
      if (e instanceof PdfTooLargeError) return err('PDF_TOO_LARGE', e.message);
      ctx.logger.error('ingest_pdf error', e);
      return err('INTERNAL', e instanceof Error ? e.message : 'Unknown error');
    }
  },
} as const;

// ---------------------------------------------------------------------------
// Legacy factory (kept for tests that wire deps directly)
// ---------------------------------------------------------------------------

export interface RetrievalToolDeps {
  cache: PaperCache;
  blobStore: BlobStore;
  sources: SourceAdapter[];
}

export function createRetrievalTools(deps: RetrievalToolDeps) {
  const retrievalService = new RetrievalService(deps);
  const ingestService = new IngestService({ blobStore: deps.blobStore });

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
    } catch (e) {
      if (e instanceof UnrecognizedIdError) return { error: e.message, code: 'UNRECOGNIZED_ID' };
      if (e instanceof NotFoundError) return { error: e.message, code: 'NOT_FOUND' };
      throw e;
    }
  }

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
    } catch (e) {
      if (e instanceof InvalidPdfError) return { error: e.message, code: 'INVALID_PDF' };
      if (e instanceof PdfTooLargeError) return { error: e.message, code: 'PDF_TOO_LARGE' };
      throw e;
    }
  }

  return { getPaper, ingestPdf };
}
