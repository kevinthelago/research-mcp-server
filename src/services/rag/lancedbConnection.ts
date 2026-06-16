/**
 * LanceDB connection stub — provides a shared Connection for the RAG layer.
 * Will be superseded by the persistence stream's getLanceDb once it lands on develop.
 */
import * as lancedb from '@lancedb/lancedb';
import { homedir } from 'os';
import { join } from 'path';

let _connection: lancedb.Connection | null = null;

export async function getLanceDb(): Promise<lancedb.Connection> {
  if (!_connection) {
    const dataDir =
      process.env['RESEARCH_MCP_DATA_DIR'] ??
      join(homedir(), '.research-mcp', 'lancedb');
    _connection = await lancedb.connect(dataDir);
  }
  return _connection;
}

/** Reset the cached connection — for testing only. */
export function resetLanceDb(): void {
  _connection = null;
}
