/** RAG-5: MCP tool definition for `semantic_search`. */

import { z } from 'zod';
import { getLanceDb } from '../services/rag/lancedbConnection.js';
import { createEmbedder } from '../services/rag/embedderFactory.js';
import { RagIndex } from '../services/rag/ragIndex.js';

export const SEMANTIC_SEARCH_TOOL_NAME = 'semantic_search' as const;

export const semanticSearchInputSchema = {
  query: z.string().min(1).describe('Natural-language search query'),
  scope: z
    .object({
      paperIds: z
        .array(z.string())
        .optional()
        .describe('Restrict search to these paper IDs. Omit to search all indexed papers.'),
    })
    .optional()
    .describe('Optional scope filter. Pass an empty paperIds array to get an empty result.'),
  topK: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(10)
    .describe('Maximum number of results to return (default 10, max 100)'),
};

let _ragIndex: RagIndex | null = null;

async function getRagIndex(): Promise<RagIndex> {
  if (!_ragIndex) {
    const embedder = await createEmbedder();
    _ragIndex = new RagIndex(embedder, getLanceDb);
  }
  return _ragIndex;
}

export interface SemanticSearchArgs {
  query: string;
  scope?: { paperIds?: string[] };
  topK: number;
}

/** Handler for the semantic_search MCP tool. */
export async function semanticSearchHandler(
  args: SemanticSearchArgs,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const ragIndex = await getRagIndex();
  const { results, note } = await ragIndex.search(args.query, args.scope, args.topK);
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ results, ...(note ? { note } : {}) }),
      },
    ],
  };
}

/**
 * Register the semantic_search tool on an MCP server.
 * Call this from server-core during server setup.
 */
export function registerSemanticSearchTool(server: {
  tool: (name: string, schema: object, handler: (args: unknown) => Promise<unknown>) => void;
}): void {
  server.tool(
    SEMANTIC_SEARCH_TOOL_NAME,
    semanticSearchInputSchema,
    semanticSearchHandler as (args: unknown) => Promise<unknown>,
  );
}
