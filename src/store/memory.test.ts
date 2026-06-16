import { describe, it, expect, beforeEach } from 'vitest'
import { InMemoryStore } from './memory.js'

let store: InMemoryStore

beforeEach(() => {
  store = new InMemoryStore()
})

describe('InMemoryStore', () => {
  describe('cache (CacheStore)', () => {
    it('get/set/has/delete round-trip', () => {
      store.cache.set('k', { v: 1 })
      expect(store.cache.get('k')).toEqual({ v: 1 })
      expect(store.cache.has('k')).toBe(true)
      store.cache.delete('k')
      expect(store.cache.get('k')).toBeUndefined()
    })

    it('expired entries are misses', () => {
      store.cache.set('k', 'val', -1)
      expect(store.cache.get('k')).toBeUndefined()
    })

    it('clear wipes all entries', () => {
      store.cache.set('a', 1)
      store.cache.set('b', 2)
      store.cache.clear()
      expect(store.cache.has('a')).toBe(false)
    })
  })

  describe('papers (PaperCache)', () => {
    const p = {
      canonicalId: 'arxiv:0',
      metadata: { title: 'T' },
      hasFullText: false,
      source: 'arxiv' as const,
    }

    it('set/get round-trip', async () => {
      await store.papers.set(p)
      expect(await store.papers.get(p.canonicalId)).toEqual(p)
    })

    it('get returns null for unknown id', async () => {
      expect(await store.papers.get('missing')).toBeNull()
    })
  })

  describe('blobs (BlobStore)', () => {
    it('store returns a path string', async () => {
      const sha256 = 'a'.repeat(64)
      const path = await store.blobs.store(Buffer.from('data'), sha256)
      expect(typeof path).toBe('string')
      expect(path).toContain(sha256)
    })
  })

  describe('getLanceDb', () => {
    it('returns a stub connection', async () => {
      expect(await store.getLanceDb()).toBeDefined()
    })

    it('accepts an injected connection', async () => {
      const fakeConn = { connect: true }
      const s = new InMemoryStore(fakeConn)
      expect(await s.getLanceDb()).toBe(fakeConn)
    })
  })

  it('close does not throw', () => {
    expect(() => store.close()).not.toThrow()
  })
})
