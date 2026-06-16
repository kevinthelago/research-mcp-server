import { z } from 'zod';
import { StructuredDocumentSchema } from '../models/document.js';
import type { ToolDef, ToolContext } from '../server/registry.js';
import type { ExtractionService } from '../services/extraction/index.js';

const InputSchema = z.object({
  canonicalId: z.string().describe('Canonical paper id (returned by get_paper / ingest_pdf).'),
});

const OutputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('document'), document: StructuredDocumentSchema }),
  z.object({ kind: z.literal('noPdf'), canonicalId: z.string(), message: z.string() }),
  z.object({
    kind: z.literal('grobidUnavailable'),
    message: z.string(),
    hint: z.string(),
  }),
]);

export const extractPaperTool: ToolDef<typeof InputSchema, typeof OutputSchema> = {
  name: 'extract_paper',
  description:
    'Run a retrieved paper through GROBID to produce a structured document ' +
    '(metadata, section tree, references, figures, tables). ' +
    'Results are cached — re-calling within the TTL returns the cached version instantly. ' +
    'Returns noPdf if the paper has no stored PDF (ingest_pdf first). ' +
    'Returns grobidUnavailable if the GROBID container is not running.',
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  handler: async (input, ctx: ToolContext) => {
    const svc = (ctx.services as { extraction?: ExtractionService }).extraction;
    if (!svc) throw new Error('extraction service not registered');

    // First try the cache
    const cached = await svc.getCachedDocument(input.canonicalId);
    if (cached) {
      return { kind: 'document' as const, document: cached };
    }

    // Look up the paper from the store
    const record = await ctx.store.papers.get(input.canonicalId);
    if (!record) {
      return {
        kind: 'noPdf' as const,
        canonicalId: input.canonicalId,
        message: `Paper "${input.canonicalId}" not found. Use get_paper or ingest_pdf first.`,
      };
    }

    if (!record.hasFullText || !record.pdfPath) {
      return {
        kind: 'noPdf' as const,
        canonicalId: input.canonicalId,
        message: `Paper "${input.canonicalId}" has no stored PDF. Use ingest_pdf to provide one.`,
      };
    }

    const paper = {
      canonicalId: input.canonicalId,
      pdfPath: record.pdfPath,
      hasFullText: record.hasFullText,
      metadata: {
        ...(record.title !== undefined ? { title: record.title } : {}),
        authors: record.authors,
        ...(record.abstract !== undefined ? { abstract: record.abstract } : {}),
        ...(record.doi !== undefined ? { doi: record.doi } : {}),
        ...(record.arxivId !== undefined ? { arxivId: record.arxivId } : {}),
        ...(record.pmid !== undefined ? { pmid: record.pmid } : {}),
        ...(record.pmcid !== undefined ? { pmcid: record.pmcid } : {}),
        ...(record.year !== undefined ? { year: record.year } : {}),
        ...(record.venue !== undefined ? { journal: record.venue } : {}),
      },
    };

    const result = await svc.extractPaper(paper);

    if (!result.ok) {
      const err = result.error;
      if (err.kind === 'GrobidUnavailableError') {
        return { kind: 'grobidUnavailable' as const, message: err.message, hint: err.hint };
      }
      // NoPdfError (shouldn't reach here after the check above, but be safe)
      return {
        kind: 'noPdf' as const,
        canonicalId: input.canonicalId,
        message: err.message,
      };
    }

    return { kind: 'document' as const, document: result.document };
  },
};
