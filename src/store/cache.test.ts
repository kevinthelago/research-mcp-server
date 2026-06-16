import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { runMigrations } from './migrations.js'
import { SqliteCacheStore } from './cache.js'

let db: DatabaseSync
let store: SqliteCacheStore

beforeEach(() => {
  db = new DatabaseSync(':memory:')
  runMigrations(db)
  store = new SqliteCacheStore(db)
})

afterEach(() => {
  db.close()
})

describe('SqliteCacheStore', () => {
  it('returns undefined for missing keys', () => {
    expect(store.get('nope')).toBeUndefined()
  })

  it('stores and retrieves values', () => {
    store.set('k', { x: 1 })
    expect(store.get('k')).toEqual({ x: 1 })
  })

  it('has() returns true for live entries', () => {
    store.set('k', 42)
    expect(store.has('k')).toBe(true)
  })

  it('has() returns false for missing entries', () => {
    expect(store.has('missing')).toBe(false)
  })

  it('treats expired entries as absent', () => {
    store.set('k', 'val', -1) // already expired
    expect(store.get('k')).toBeUndefined()
    expect(store.has('k')).toBe(false)
  })

  it('delete removes an entry', () => {
    store.set('k', 1)
    store.delete('k')
    expect(store.get('k')).toBeUndefined()
  })

  it('clear removes all entries', () => {
    store.set('a', 1)
    store.set('b', 2)
    store.clear()
    expect(store.has('a')).toBe(false)
    expect(store.has('b')).toBe(false)
  })

  it('upserts on duplicate key', () => {
    store.set('k', 'first')
    store.set('k', 'second')
    expect(store.get('k')).toBe('second')
  })
})
