/**
 * Stub — owned by persistence (PERS-2, PERS-3).
 * This file will be replaced when persistence lands on develop.
 * Keep in sync with contracts/store.md.
 */

export interface PaperRecord {
  canonicalId: string;
  doi?: string;
  arxivId?: string;
  pmid?: string;
  pmcid?: string;
  title: string;
  authors: string[];
  abstract?: string;
  venue?: string;
  year?: number;
  url?: string;
  sources: string[];
  citationCount?: number;
  openAccessPdfUrl?: string;
  hasFullText: boolean;
  pdfPath?: string;
  createdAt: number;
  updatedAt: number;
}

export interface CacheStore {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T, ttlMs: number): Promise<void>;
  has(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}

export interface PaperStore {
  get(canonicalId: string): Promise<PaperRecord | undefined>;
  upsert(record: PaperRecord): Promise<void>;
  list(opts?: { limit?: number; offset?: number }): Promise<PaperRecord[]>;
}

export interface BlobStore {
  save(canonicalId: string, data: Buffer): Promise<string>;
  load(canonicalId: string): Promise<Buffer | undefined>;
  exists(canonicalId: string): Promise<boolean>;
  path(canonicalId: string): string;
}

export interface LanceDbHandle {
  openTable(name: string): Promise<unknown>;
  createTable(name: string, data: unknown): Promise<unknown>;
}

export interface Store {
  cache: CacheStore;
  papers: PaperStore;
  blobs: BlobStore;
  lancedb: LanceDbHandle;
}
