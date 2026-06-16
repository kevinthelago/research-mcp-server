/** RAG-4: LanceDB-backed vector index with per-model table namespacing. */

import type * as lancedb from '@lancedb/lancedb';
import type { StructuredDocument } from '../../contracts/extraction.js';
import type { ChunkVector, SearchResult } from '../../models/chunk.js';
import type { Embedder } from './embedder.js';
import { Chunker } from './chunker.js';
import type { ChunkerOptions } from './chunker.js';

export interface SearchScope {
  /** Restrict search to these paper IDs. Omit to search all indexed papers. */
  paperIds?: string[];
}

export interface RagIndexOptions {
  chunkerOptions?: ChunkerOptions;
}

function sanitizeTableName(modelId: string): string {
  return `chunks_${modelId.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}`;
}

/** Approximate cosine similarity from L2 distance on unit-normalized vectors. */
function distanceToScore(distance: number): number {
  return Math.max(0, 1 - distance / 2);
}

function isTableNotFound(err: unknown): boolean {
  return err instanceof Error && err.message.includes('was not found');
}

export class RagIndex {
  private readonly chunker: Chunker;
  private readonly tableName: string;

  constructor(
    private readonly embedder: Embedder,
    private readonly getDb: () => Promise<lancedb.Connection>,
    options: RagIndexOptions = {},
  ) {
    this.chunker = new Chunker(options.chunkerOptions);
    this.tableName = sanitizeTableName(embedder.modelId);
  }

  /**
   * Chunk, embed, and store a document in LanceDB.
   * Re-indexing the same paper is idempotent (delete-then-insert).
   * @returns Number of chunks stored.
   */
  async index(doc: StructuredDocument): Promise<number> {
    const chunks = this.chunker.chunk(doc);
    if (chunks.length === 0) return 0;

    const vectors = await this.embedder.embed(chunks.map((c) => c.text));
    const records: ChunkVector[] = chunks.map((chunk, i) => ({
      ...chunk,
      vector: vectors[i] ?? [],
    }));
    // LanceDB requires Record<string, unknown>[] — ChunkVector satisfies this at runtime.
    const lanceRows = records as unknown as Record<string, unknown>[];

    const db = await this.getDb();

    let table: lancedb.Table;
    try {
      table = await db.openTable(this.tableName);
      // Idempotent: remove any prior indexing for this paper.
      await table.delete(`paperId = '${doc.paperId.replace(/'/g, "\\'")}'`);
      await table.add(lanceRows);
    } catch (err) {
      if (isTableNotFound(err)) {
        table = await db.createTable(this.tableName, lanceRows);
      } else {
        throw err;
      }
    }

    return records.length;
  }

  /**
   * Semantic search over indexed chunks.
   *
   * Empty-scope rule: if `scope.paperIds` is an empty array, returns an empty
   * result set with a note rather than searching all papers.
   */
  async search(
    query: string,
    scope?: SearchScope,
    topK = 10,
  ): Promise<{ results: SearchResult[]; note?: string }> {
    if (scope?.paperIds !== undefined && scope.paperIds.length === 0) {
      return {
        results: [],
        note: 'No papers in scope — provide paperIds or omit scope to search all indexed papers.',
      };
    }

    const db = await this.getDb();
    let table: lancedb.Table;
    try {
      table = await db.openTable(this.tableName);
    } catch (err) {
      if (isTableNotFound(err)) {
        return { results: [], note: 'No papers have been indexed yet.' };
      }
      throw err;
    }

    const queryVectors = await this.embedder.embed([query]);
    const queryVector = queryVectors[0];
    if (!queryVector) {
      return { results: [], note: 'Embedder returned no vector for the query.' };
    }

    let searchQuery = table.search(queryVector).limit(topK);

    if (scope?.paperIds && scope.paperIds.length > 0) {
      const escaped = scope.paperIds.map((id) => `'${id.replace(/'/g, "\\'")}'`);
      searchQuery = searchQuery.where(`paperId IN (${escaped.join(', ')})`);
    }

    const rows = (await searchQuery.toArray()) as Array<ChunkVector & { _distance: number }>;

    const results: SearchResult[] = rows.map((row) => ({
      chunkId: row.id,
      paperId: row.paperId,
      sectionId: row.sectionId,
      sectionTitle: row.sectionTitle,
      text: row.text,
      charStart: row.charStart,
      charEnd: row.charEnd,
      score: distanceToScore(row._distance),
    }));

    return { results };
  }
}
