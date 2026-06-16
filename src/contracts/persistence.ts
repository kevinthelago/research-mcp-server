import type { RetrievedPaper } from '../models/retrievedPaper.js';

/** Cache for resolved papers keyed by canonical ID. */
export interface PaperCache {
  get(canonicalId: string): Promise<RetrievedPaper | null>;
  set(paper: RetrievedPaper): Promise<void>;
}

/** Blob storage for PDF files. */
export interface BlobStore {
  /** Store a PDF buffer and return an absolute path to the stored file. */
  store(content: Buffer, sha256: string): Promise<string>;
}
