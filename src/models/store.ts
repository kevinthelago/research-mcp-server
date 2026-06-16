import type { RetrievedPaper } from './retrievedPaper.js'

export type { RetrievedPaper }

/** Contract: key-value cache with per-entry TTL. Expired entries are treated as absent. */
export interface CacheStore {
  get<T>(key: string): T | undefined
  set<T>(key: string, value: T, ttlMs?: number): void
  has(key: string): boolean
  delete(key: string): void
  /** Evicts all cache entries; leaves PDFs and vector data intact. */
  clear(): void
}

/** Contract: stores paper metadata keyed by canonical id. */
export interface PaperCache {
  get(canonicalId: string): Promise<RetrievedPaper | null>
  set(paper: RetrievedPaper): Promise<void>
}

/** Contract: content-addressed PDF blob storage under <dataDir>/pdfs/. Never inlined in SQLite. */
export interface BlobStore {
  /** Stores the PDF buffer and returns the absolute path to the stored file. */
  store(content: Buffer, sha256: string): Promise<string>
}

/** Lazily-opened LanceDB connection handle. */
export type LanceDbConnection = object

/** Top-level injectable store facade. */
export interface Store {
  cache: CacheStore
  papers: PaperCache
  blobs: BlobStore
  getLanceDb(): Promise<LanceDbConnection>
  /** Releases held resources (closes DB, etc.). */
  close(): void
}
