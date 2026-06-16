import type { DatabaseSync } from 'node:sqlite'
import type { Store, LanceDbConnection } from '../models/store.js'
import { openDatabase } from './db.js'
import { SqliteCacheStore } from './cache.js'
import { SqlitePaperCache } from './paper.js'
import { FileBlobStore } from './blob.js'
import { getLanceDb as openLanceDb } from './lancedb.js'

export { openDatabase } from './db.js'
export { SqliteCacheStore } from './cache.js'
export { SqlitePaperCache } from './paper.js'
export { FileBlobStore } from './blob.js'
export { getLanceDb } from './lancedb.js'
export { InMemoryStore } from './memory.js'
export type { Store, CacheStore, PaperCache, BlobStore, LanceDbConnection } from '../models/store.js'

/**
 * Disk-backed Store implementation.
 * - node:sqlite at <dataDir>/cache.db for cache + paper metadata
 * - Filesystem at <dataDir>/pdfs/ for raw PDF blobs (content-addressed by sha256)
 * - LanceDB at <dataDir>/lancedb for vector data
 */
export class SqliteStore implements Store {
  readonly cache: SqliteCacheStore
  readonly papers: SqlitePaperCache
  readonly blobs: FileBlobStore

  private readonly db: DatabaseSync
  private lanceConnection: LanceDbConnection | undefined
  private readonly dataDir: string

  constructor(dataDir: string) {
    this.dataDir = dataDir
    this.db = openDatabase(dataDir)
    this.cache = new SqliteCacheStore(this.db)
    this.papers = new SqlitePaperCache(this.db)
    this.blobs = new FileBlobStore(dataDir)
  }

  async getLanceDb(): Promise<LanceDbConnection> {
    if (!this.lanceConnection) {
      this.lanceConnection = await openLanceDb(this.dataDir)
    }
    return this.lanceConnection
  }

  close(): void {
    this.db.close()
  }
}

/** Constructs the injectable Store backed by the given data directory. */
export function createStore(dataDir: string): SqliteStore {
  return new SqliteStore(dataDir)
}
