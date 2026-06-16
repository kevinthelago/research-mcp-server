import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { BlobStore } from '../models/store.js'

/**
 * Content-addressed PDF storage: files live at <dataDir>/pdfs/<sha256>.pdf.
 * Files are never inlined in SQLite; clear() on the cache leaves this directory intact.
 */
export class FileBlobStore implements BlobStore {
  private readonly pdfsDir: string

  constructor(dataDir: string) {
    this.pdfsDir = join(dataDir, 'pdfs')
    mkdirSync(this.pdfsDir, { recursive: true })
  }

  async store(content: Buffer, sha256: string): Promise<string> {
    const filePath = join(this.pdfsDir, `${sha256}.pdf`)
    if (!existsSync(filePath)) {
      writeFileSync(filePath, content)
    }
    return filePath
  }
}
