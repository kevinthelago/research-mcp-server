import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import type { LanceDbConnection } from '../models/store.js'

// lancedb is optional at import time so the module loads even in test environments.
let lanceConnect: ((uri: string) => Promise<LanceDbConnection>) | undefined

async function loadLanceDb(): Promise<(uri: string) => Promise<LanceDbConnection>> {
  if (!lanceConnect) {
    const mod = await import('@lancedb/lancedb')
    lanceConnect = mod.connect as (uri: string) => Promise<LanceDbConnection>
  }
  return lanceConnect
}

/**
 * Opens (or creates) the LanceDB database at <dataDir>/lancedb.
 * The RAG stream creates and queries tables against the returned connection.
 */
export async function getLanceDb(dataDir: string): Promise<LanceDbConnection> {
  const lanceDir = join(dataDir, 'lancedb')
  mkdirSync(lanceDir, { recursive: true })
  const connect = await loadLanceDb()
  return connect(lanceDir)
}
