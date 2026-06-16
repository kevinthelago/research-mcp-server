import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { runMigrations } from './migrations.js'

/**
 * Opens (or creates) the SQLite database at <dataDir>/cache.db,
 * enables WAL mode for concurrent reads, and runs all pending migrations.
 */
export function openDatabase(dataDir: string): DatabaseSync {
  mkdirSync(dataDir, { recursive: true })

  const db = new DatabaseSync(join(dataDir, 'cache.db'))
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')

  runMigrations(db)

  return db
}
