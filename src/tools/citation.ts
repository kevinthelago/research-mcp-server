import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CitationResolver, referenceHash } from '../services/citation/CitationResolver.js';
import type { IDocumentStore, ParsedReference, ReferenceResolution } from '../services/citation/types.js';

export type CitationCache = Map<string, { resolvedId: string | null; confidence: number }>;

const ResolveCitationsInput = {
  documentId: z
    .string()
    .min(1)
    .describe('ID of the stored document whose references should be resolved'),
  forceRefresh: z
    .boolean()
    .optional()
    .describe('Re-resolve references even if cached results exist'),
};

/**
 * Register the resolve_citations tool on an MCP server.
 *
 * The cache is an in-memory Map keyed by reference hash (see referenceHash).
 * Pass a shared cache instance to persist hits across tool invocations in one
 * server lifetime. Wire to SQLite persistence once that stream lands.
 */
export function registerCitationTool(
  server: McpServer,
  deps: {
    store: IDocumentStore;
    resolver: CitationResolver;
    cache?: CitationCache;
  },
): void {
  const cache: CitationCache = deps.cache ?? new Map<string, { resolvedId: string | null; confidence: number }>();

  server.tool(
    'resolve_citations',
    'Resolve the extracted references of a stored document to canonical identifiers ' +
      '(DOI, arXiv ID) with confidence scores. Writes resolvedId and confidence back ' +
      'onto the document so get_element reflects them.',
    ResolveCitationsInput,
    async ({ documentId, forceRefresh }) => {
      const doc = await deps.store.getDocument(documentId);
      if (!doc) {
        return {
          content: [{ type: 'text' as const, text: `Document not found: ${documentId}` }],
          isError: true,
        };
      }

      // Decide which references need (re-)resolving
      const toResolve: ParsedReference[] = forceRefresh
        ? doc.references
        : doc.references.filter(r => r.resolvedId === null && r.confidence === 0);

      // Split into cache hits vs. refs that need a network call
      const pending: ParsedReference[] = [];
      const hashToResult = new Map<string, { resolvedId: string | null; confidence: number }>();

      for (const ref of toResolve) {
        const key = referenceHash(ref);
        const hit = cache.get(key);
        if (hit && !forceRefresh) {
          hashToResult.set(key, hit);
        } else {
          pending.push(ref);
        }
      }

      // Resolve uncached references
      let resolutions: ReferenceResolution[] = [];
      if (pending.length > 0) {
        resolutions = await deps.resolver.resolveAll(pending);
        for (const r of resolutions) {
          const key = referenceHash(r.reference);
          const entry = { resolvedId: r.resolvedId, confidence: r.confidence };
          cache.set(key, entry);
          hashToResult.set(key, entry);
        }
      }

      // Write results back to the document
      const updatedRefs = doc.references.map(ref => {
        const result = hashToResult.get(referenceHash(ref));
        return result !== undefined ? { ...ref, ...result } : ref;
      });
      await deps.store.updateDocumentReferences(documentId, updatedRefs);

      const totalRefs = doc.references.length;
      const alreadyResolved = totalRefs - toResolve.length;
      const nowResolved = resolutions.filter(r => r.status === 'resolved').length;
      const cacheHits = hashToResult.size - nowResolved;
      const errors = resolutions.filter(r => r.status === 'error').length;
      const unresolved = resolutions.filter(r => r.status === 'unresolved').length;

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                documentId,
                summary: {
                  total: totalRefs,
                  alreadyResolved,
                  cacheHits,
                  resolved: nowResolved,
                  unresolved,
                  errors,
                },
                resolutions: resolutions.map(r => ({
                  raw: r.reference.rawString.slice(0, 100),
                  resolvedId: r.resolvedId,
                  confidence: Math.round(r.confidence * 1000) / 1000,
                  status: r.status,
                  ...(r.error !== undefined ? { error: r.error } : {}),
                })),
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );
}
