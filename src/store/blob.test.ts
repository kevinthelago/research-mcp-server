import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FileBlobStore } from './blob.js'

let tmpDir: string
let store: FileBlobStore

function makeStore(): FileBlobStore {
  tmpDir = mkdtempSync(join(tmpdir(), 'pers-blob-'))
  store = new FileBlobStore(tmpDir)
  return store
}

afterEach(() => {
  if (tmpDir) {
    rmSync(tmpDir, { recursive: true, force: true })
    tmpDir = ''
  }
})

describe('FileBlobStore', () => {
  it('stores content and returns the absolute path', async () => {
    makeStore()
    const sha256 = 'a'.repeat(64)
    const data = Buffer.from('PDF content')
    const path = await store.store(data, sha256)
    expect(path).toContain(sha256)
    expect(path.endsWith('.pdf')).toBe(true)
  })

  it('is idempotent — same sha256 returns same path', async () => {
    makeStore()
    const sha256 = 'b'.repeat(64)
    const data = Buffer.from('PDF')
    const p1 = await store.store(data, sha256)
    const p2 = await store.store(data, sha256)
    expect(p1).toBe(p2)
  })

  it('creates the pdfs directory if needed', async () => {
    makeStore()
    const { existsSync } = await import('node:fs')
    expect(existsSync(join(tmpDir, 'pdfs'))).toBe(true)
  })
})
