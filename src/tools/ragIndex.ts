/** RAG-4: MCP tool definition for `index_paper`. */

import { z } from 'zod';
import { structuredDocumentSchema, type StructuredDocument } from '../contracts/extraction.js';
import { getLanceDb } from '../services/rag/lancedbConnection.js';
import { createEmbedder } from '../services/rag/embedderFactory.js';
import { RagIndex } from '../services/rag/ragIndex.js';

export const INDEX_PAPER_TOOL_NAME = 'index_paper' as const;

export const indexPaperInputSchema = {
  paperId: z.string().describe('Canonical paper identifier (must match document.paperId)'),
  document: structuredDocumentSchema.describe('The structured document to index'),
};

export interface IndexPaperArgs {
  paperId: string;
  document: StructuredDocument;
}

let _ragIndex: RagIndex | null = null;

async function getRagIndex(): Promise<RagIndex> {
  if (!_ragIndex) {
    const embedder = await createEmbedder();
    _ragIndex = new RagIndex(embedder, getLanceDb);
  }
  return _ragIndex;
}

/** Handler for the index_paper MCP tool. */
export async function indexPaperHandler(
  args: IndexPaperArgs,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const ragIndex = await getRagIndex();
  const count = await ragIndex.index(args.document);
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          paperId: args.document.paperId,
          chunksIndexed: count,
          message: `Paper ${args.document.paperId} indexed with ${count} chunks.`,
        }),
      },
    ],
  };
}

/**
 * Register the index_paper tool on an MCP server.
 * Call this from server-core during server setup.
 */
export function registerIndexPaperTool(server: {
  tool: (name: string, schema: object, handler: (args: unknown) => Promise<unknown>) => void;
}): void {
  server.tool(INDEX_PAPER_TOOL_NAME, indexPaperInputSchema, indexPaperHandler as (args: unknown) => Promise<unknown>);
}
