import type { DatabaseSync } from 'node:sqlite'
import type { CacheStore } from '../models/store.js'

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000 // 24 h

type CacheRow = { value: string; expires_at: number | null }

export class SqliteCacheStore implements CacheStore {
  constructor(private readonly db: DatabaseSync) {}

  get<T>(key: string): T | undefined {
    const row = this.db
      .prepare('SELECT value, expires_at FROM cache WHERE key = ?')
      .get(key) as CacheRow | undefined

    if (!row) return undefined
    if (row.expires_at !== null && row.expires_at <= Date.now()) {
      this.delete(key)
      return undefined
    }
    return JSON.parse(row.value) as T
  }

  set<T>(key: string, value: T, ttlMs = DEFAULT_TTL_MS): void {
    const expires_at = Date.now() + ttlMs
    this.db
      .prepare(
        `INSERT INTO cache (key, value, expires_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at`,
      )
      .run(key, JSON.stringify(value), expires_at)
  }

  has(key: string): boolean {
    return this.get(key) !== undefined
  }

  delete(key: string): void {
    this.db.prepare('DELETE FROM cache WHERE key = ?').run(key)
  }

  clear(): void {
    this.db.exec('DELETE FROM cache')
  }
}
