import type { DatabaseSync } from 'node:sqlite'
import type { PaperCache } from '../models/store.js'
import { RetrievedPaperSchema } from '../models/retrievedPaper.js'
import type { RetrievedPaper } from '../models/retrievedPaper.js'

type PaperRow = { metadata: string }

/** SQLite-backed implementation of the PaperCache contract. */
export class SqlitePaperCache implements PaperCache {
  constructor(private readonly db: DatabaseSync) {}

  async get(canonicalId: string): Promise<RetrievedPaper | null> {
    const row = this.db
      .prepare('SELECT metadata FROM papers WHERE id = ?')
      .get(canonicalId) as PaperRow | undefined

    if (!row) return null
    return RetrievedPaperSchema.parse(JSON.parse(row.metadata))
  }

  async set(paper: RetrievedPaper): Promise<void> {
    const validated = RetrievedPaperSchema.parse(paper)
    this.db
      .prepare(
        `INSERT INTO papers (id, metadata, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET metadata = excluded.metadata, updated_at = excluded.updated_at`,
      )
      .run(paper.canonicalId, JSON.stringify(validated), Date.now())
  }
}
