import type { CacheStore, PaperCache, BlobStore, Store, LanceDbConnection } from '../models/store.js'
import type { RetrievedPaper } from '../models/retrievedPaper.js'

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000

interface CacheEntry<T> {
  value: T
  expiresAt: number
}

class InMemoryCacheStore implements CacheStore {
  private readonly entries = new Map<string, CacheEntry<unknown>>()

  get<T>(key: string): T | undefined {
    const entry = this.entries.get(key) as CacheEntry<T> | undefined
    if (!entry) return undefined
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key)
      return undefined
    }
    return entry.value
  }

  set<T>(key: string, value: T, ttlMs = DEFAULT_TTL_MS): void {
    this.entries.set(key, { value, expiresAt: Date.now() + ttlMs })
  }

  has(key: string): boolean {
    return this.get(key) !== undefined
  }

  delete(key: string): void {
    this.entries.delete(key)
  }

  clear(): void {
    this.entries.clear()
  }
}

class InMemoryPaperCache implements PaperCache {
  private readonly entries = new Map<string, RetrievedPaper>()

  async get(canonicalId: string): Promise<RetrievedPaper | null> {
    return this.entries.get(canonicalId) ?? null
  }

  async set(paper: RetrievedPaper): Promise<void> {
    this.entries.set(paper.canonicalId, paper)
  }
}

class InMemoryBlobStore implements BlobStore {
  private readonly entries = new Map<string, { content: Buffer; path: string }>()

  async store(content: Buffer, sha256: string): Promise<string> {
    const path = `/memory/pdfs/${sha256}.pdf`
    this.entries.set(sha256, { content, path })
    return path
  }
}

/**
 * Fully in-memory Store implementation.
 * Intended for unit tests — no disk access, no external dependencies.
 */
export class InMemoryStore implements Store {
  readonly cache: CacheStore = new InMemoryCacheStore()
  readonly papers: PaperCache = new InMemoryPaperCache()
  readonly blobs: BlobStore = new InMemoryBlobStore()

  private lanceDb: LanceDbConnection | undefined

  constructor(lanceDb?: LanceDbConnection) {
    this.lanceDb = lanceDb
  }

  async getLanceDb(): Promise<LanceDbConnection> {
    if (!this.lanceDb) {
      this.lanceDb = {}
    }
    return this.lanceDb
  }

  close(): void {}
}
