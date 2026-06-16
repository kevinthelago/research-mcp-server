/** RAG-2: Config-driven embedder selection. */

import { ApiEmbedder } from './apiEmbedder.js';
import { LocalEmbedder } from './embedder.js';
import type { Embedder } from './embedder.js';

/**
 * Returns the appropriate embedder based on environment variables.
 * Priority: VOYAGE_API_KEY > OPENAI_API_KEY > local (bge-small-en-v1.5).
 */
export async function createEmbedder(): Promise<Embedder> {
  const voyageKey = process.env['VOYAGE_API_KEY'];
  if (voyageKey) {
    return new ApiEmbedder({ provider: 'voyage', apiKey: voyageKey });
  }

  const openaiKey = process.env['OPENAI_API_KEY'];
  if (openaiKey) {
    return new ApiEmbedder({ provider: 'openai', apiKey: openaiKey });
  }

  return new LocalEmbedder();
}
