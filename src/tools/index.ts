/**
 * Central tool registry.
 *
 * Consumed by:
 *  - scripts/gen-tool-docs.ts  — needs { name, description, inputSchema: ZodObject }
 *  - src/cli.ts                — registers ToolDef objects via registerTool()
 *
 * Each stream adds its own toolDef exports here; server-core wires the
 * registerTool() calls at startup.
 */

import { z } from 'zod';
import {
  getPaperToolDef,
  ingestPdfToolDef,
  GetPaperInputSchema,
  ingestPdfInputShape,
} from './retrieval.js';

export { getPaperToolDef, ingestPdfToolDef };

// ---------------------------------------------------------------------------
// All ToolDef objects — used by cli.ts startup wiring
// ---------------------------------------------------------------------------

export const toolDefs = [
  getPaperToolDef,
  ingestPdfToolDef,
  // search, extraction, rag, citation stream defs added here as they land
];

// ---------------------------------------------------------------------------
// Schema-only list — used by scripts/gen-tool-docs.ts
// ---------------------------------------------------------------------------

export const tools = [
  {
    name: 'get_paper',
    description: getPaperToolDef.description,
    inputSchema: GetPaperInputSchema,
  },
  {
    name: 'ingest_pdf',
    description: ingestPdfToolDef.description,
    // Use the plain object (without .refine) so zodToJsonSchema exposes properties in docs
    inputSchema: z.object(ingestPdfInputShape),
  },
  // Stubs for streams not yet contributing their schema — generator can run
  {
    name: 'search',
    description: 'Search academic papers across arXiv, Semantic Scholar, PubMed, and Crossref.',
    inputSchema: z.object({
      query: z.string().describe('Search query for academic papers'),
      sources: z.array(z.enum(['arxiv', 'semantic-scholar', 'pubmed', 'crossref'])).optional(),
      limit: z.number().int().min(1).max(100).optional(),
      offset: z.number().int().min(0).optional(),
      yearFrom: z.number().int().optional(),
      yearTo: z.number().int().optional(),
    }),
  },
  {
    name: 'extract_paper',
    description: 'Extract structured content from an ingested paper via GROBID.',
    inputSchema: z.object({
      paper_id: z.string().min(1),
      force: z.boolean().optional(),
    }),
  },
  {
    name: 'semantic_search',
    description: 'Vector-similarity search over ingested and indexed papers.',
    inputSchema: z.object({
      query: z.string().min(1),
      limit: z.number().int().min(1).max(100).optional(),
      paper_ids: z.array(z.string()).optional(),
    }),
  },
];
