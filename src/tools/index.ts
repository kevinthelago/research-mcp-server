/**
 * Central tool registry — imported by scripts/gen-tool-docs.ts to generate docs.
 *
 * Each stream contributes its own tool schemas here. Server-core wires the
 * actual McpServer.tool() calls; this file is the single source of truth for
 * schema + description that appears in docs and type-checking.
 *
 * Placeholder entries (search, extract_paper, semantic_search, etc.) will be
 * replaced by their respective streams when they land on develop.
 */

import { z } from 'zod';
import { GetPaperInputSchema, IngestPdfInputSchema } from './retrieval.js';

// ---------------------------------------------------------------------------
// Retrieval tools (owned by this stream)
// ---------------------------------------------------------------------------

const retrievalTools = [
  {
    name: 'get_paper',
    description:
      'Resolve a paper identifier (DOI, arXiv ID, PMID, PMCID, or URL) to ' +
      'metadata and, when an open-access PDF is available, download and cache ' +
      'it. Returns hasFullText=false when no PDF is available — this is not an ' +
      'error. Throws NOT_FOUND when no source recognises the identifier.',
    inputSchema: GetPaperInputSchema,
  },
  {
    name: 'ingest_pdf',
    description:
      'Ingest a PDF by filesystem path or base64-encoded bytes. Validates PDF ' +
      'magic bytes, enforces a 200 MB size cap, stores the content in the blob ' +
      'store, and mints a content-sha256 canonical ID (idempotent — the same ' +
      'bytes always yield the same ID). Returns hasFullText=true.',
    inputSchema: IngestPdfInputSchema,
  },
];

// ---------------------------------------------------------------------------
// Placeholder stubs — to be replaced by their owning streams
// ---------------------------------------------------------------------------
// These are minimal stubs so the generator can run before other streams land.

const searchToolStub = {
  name: 'search',
  description: '(stub — search stream not yet landed) Search academic databases.',
  inputSchema: z.object({
    query: z.string().min(1).describe('Search query'),
    sources: z
      .array(z.enum(['arxiv', 'semantic_scholar', 'pubmed']))
      .optional()
      .describe('Data sources to query. Default: all.'),
    limit: z.number().int().min(1).max(50).optional().describe('Max results per source. Default: 10.'),
    year_from: z.number().int().optional().describe('Filter from this year (inclusive).'),
    year_to: z.number().int().optional().describe('Filter to this year (inclusive).'),
  }),
};

const extractPaperStub = {
  name: 'extract_paper',
  description:
    '(stub — extraction stream not yet landed) Extract structured content via GROBID.',
  inputSchema: z.object({
    paper_id: z.string().min(1).describe('Paper ID from get_paper or ingest_pdf.'),
    force: z.boolean().optional().describe('Re-extract even if cached. Default: false.'),
  }),
};

const semanticSearchStub = {
  name: 'semantic_search',
  description: '(stub — rag stream not yet landed) Vector-similarity search over ingested papers.',
  inputSchema: z.object({
    query: z.string().min(1).describe('Natural-language search query.'),
    limit: z.number().int().min(1).max(100).optional().describe('Max results. Default: 10.'),
    paper_ids: z.array(z.string()).optional().describe('Restrict search to these paper IDs.'),
  }),
};

// ---------------------------------------------------------------------------
// Exported registry
// ---------------------------------------------------------------------------

export const tools = [
  ...retrievalTools,
  searchToolStub,
  extractPaperStub,
  semanticSearchStub,
];
