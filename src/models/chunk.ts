/** A text chunk produced by the Chunker with full provenance metadata. */
export interface Chunk {
  /** Deterministic SHA-256 hash (first 16 hex chars) of paperId:sectionId:charStart:charEnd. */
  id: string;
  paperId: string;
  sectionId: string;
  sectionTitle: string;
  text: string;
  /** Character offset within the section's content string. */
  charStart: number;
  charEnd: number;
  tokenCount: number;
}

/** A Chunk augmented with its embedding vector for storage in LanceDB. */
export interface ChunkVector extends Chunk {
  vector: number[];
}

/** A search result returned by RagIndex.search(). */
export interface SearchResult {
  chunkId: string;
  paperId: string;
  sectionId: string;
  sectionTitle: string;
  text: string;
  charStart: number;
  charEnd: number;
  /** Cosine similarity approximation (1 = identical, 0 = orthogonal). */
  score: number;
}
