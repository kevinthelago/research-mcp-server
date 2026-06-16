import type { DatabaseSync } from 'node:sqlite'

/** Each migration runs exactly once, in version order. Must be idempotent. */
const MIGRATIONS: ReadonlyArray<{ version: number; sql: string }> = [
  {
    version: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS cache (
        key       TEXT PRIMARY KEY,
        value     TEXT NOT NULL,
        expires_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS papers (
        id         TEXT PRIMARY KEY,
        metadata   TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `,
  },
]

export function runMigrations(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version    INTEGER PRIMARY KEY,
      applied_at INTEGER NOT NULL
    )
  `)

  const applied = db
    .prepare('SELECT version FROM schema_version ORDER BY version')
    .all() as Array<{ version: number }>

  const appliedSet = new Set(applied.map((r) => r.version))

  for (const migration of MIGRATIONS) {
    if (appliedSet.has(migration.version)) continue

    db.exec(migration.sql)
    db.prepare('INSERT INTO schema_version (version, applied_at) VALUES (?, ?)').run(
      migration.version,
      Date.now(),
    )
  }
}
