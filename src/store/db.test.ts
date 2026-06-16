import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDatabase } from './db.js'

let tmpDir: string

function makeTmp(): string {
  tmpDir = mkdtempSync(join(tmpdir(), 'pers-test-'))
  return tmpDir
}

afterEach(() => {
  if (tmpDir) {
    rmSync(tmpDir, { recursive: true, force: true })
    tmpDir = ''
  }
})

describe('openDatabase', () => {
  it('creates the db file and schema_version table', () => {
    const dir = makeTmp()
    const db = openDatabase(dir)

    const rows = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'")
      .all()
    expect(rows).toHaveLength(1)
    db.close()
  })

  it('runs migrations idempotently', () => {
    const dir = makeTmp()
    const db1 = openDatabase(dir)
    db1.close()

    // Opening again must not throw or duplicate migration records.
    const db2 = openDatabase(dir)
    const rows = db2
      .prepare('SELECT * FROM schema_version')
      .all() as Array<{ version: number }>
    expect(rows.filter((r) => r.version === 1)).toHaveLength(1)
    db2.close()
  })

  it('creates the cache and papers tables', () => {
    const dir = makeTmp()
    const db = openDatabase(dir)

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as Array<{ name: string }>
    const names = tables.map((t) => t.name)
    expect(names).toContain('cache')
    expect(names).toContain('papers')
    db.close()
  })
})
