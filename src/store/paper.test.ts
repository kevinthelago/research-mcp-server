import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { runMigrations } from './migrations.js'
import { SqlitePaperCache } from './paper.js'
import type { RetrievedPaper } from '../models/retrievedPaper.js'

let db: DatabaseSync
let store: SqlitePaperCache

const PAPER: RetrievedPaper = {
  canonicalId: 'arxiv:2301.00001',
  metadata: {
    title: 'Test Paper',
    authors: ['Alice', 'Bob'],
    abstract: 'An abstract.',
  },
  hasFullText: false,
  source: 'arxiv',
}

beforeEach(() => {
  db = new DatabaseSync(':memory:')
  runMigrations(db)
  store = new SqlitePaperCache(db)
})

afterEach(() => {
  db.close()
})

describe('SqlitePaperCache', () => {
  it('returns null for unknown id', async () => {
    expect(await store.get('nope')).toBeNull()
  })

  it('stores and retrieves a paper', async () => {
    await store.set(PAPER)
    expect(await store.get(PAPER.canonicalId)).toEqual(PAPER)
  })

  it('upserts on duplicate id', async () => {
    await store.set(PAPER)
    const updated: RetrievedPaper = { ...PAPER, metadata: { ...PAPER.metadata, title: 'Updated' } }
    await store.set(updated)
    expect((await store.get(PAPER.canonicalId))?.metadata.title).toBe('Updated')
  })
})
