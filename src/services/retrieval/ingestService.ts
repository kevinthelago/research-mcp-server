import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileTypeFromBuffer } from 'file-type';
import type { BlobStore } from '../../contracts/persistence.js';
import type { RetrievedPaper } from '../../models/retrievedPaper.js';

/** Maximum accepted PDF size: 200 MB */
const MAX_PDF_BYTES = 200 * 1024 * 1024;

/** PDF magic bytes: %PDF */
const PDF_MAGIC = Buffer.from([0x25, 0x50, 0x44, 0x46]); // %PDF

export class InvalidPdfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidPdfError';
  }
}

export class PdfTooLargeError extends Error {
  constructor(public readonly byteLength: number) {
    super(`PDF exceeds maximum size of ${MAX_PDF_BYTES} bytes (got ${byteLength})`);
    this.name = 'PdfTooLargeError';
  }
}

export interface IngestServiceDeps {
  blobStore: BlobStore;
}

export class IngestService {
  constructor(private readonly deps: IngestServiceDeps) {}

  /**
   * Ingest a PDF from either a file-system path or raw bytes (Buffer / base64).
   *
   * Validates PDF magic bytes using the `file-type` library, enforces a 200 MB
   * size cap, stores the content in the blob store, and mints a content-sha256
   * canonical ID. Idempotent: the same bytes always produce the same canonical ID.
   */
  async ingest(source: string | Buffer): Promise<RetrievedPaper> {
    const buf = typeof source === 'string'
      ? await this.loadFromPath(source)
      : source;

    this.validateSize(buf);
    await this.validatePdf(buf);

    const sha256 = computeSha256Hex(buf);
    const canonicalId = `sha256:${sha256}`;
    const pdfPath = await this.deps.blobStore.store(buf, sha256);

    return {
      canonicalId,
      metadata: {},
      pdfPath,
      hasFullText: true,
      source: 'user_upload',
    };
  }

  /**
   * Ingest a PDF from a base64-encoded string.
   * Convenience wrapper around `ingest(Buffer)`.
   */
  async ingestBase64(base64: string): Promise<RetrievedPaper> {
    const buf = Buffer.from(base64, 'base64');
    return this.ingest(buf);
  }

  private async loadFromPath(filePath: string): Promise<Buffer> {
    try {
      const data = await readFile(filePath);
      return Buffer.from(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new InvalidPdfError(`Cannot read file at path "${filePath}": ${msg}`);
    }
  }

  private validateSize(buf: Buffer): void {
    if (buf.byteLength > MAX_PDF_BYTES) {
      throw new PdfTooLargeError(buf.byteLength);
    }
    if (buf.byteLength === 0) {
      throw new InvalidPdfError('PDF buffer is empty');
    }
  }

  private async validatePdf(buf: Buffer): Promise<void> {
    // Primary check: file-type library inspects actual magic bytes / file structure
    const type = await fileTypeFromBuffer(buf);
    if (type?.mime === 'application/pdf') return;

    // Fallback: raw magic byte check (some minimal PDFs lack file-type signatures)
    if (buf.slice(0, 4).equals(PDF_MAGIC)) return;

    throw new InvalidPdfError(
      `Content is not a valid PDF (detected type: ${type?.mime ?? 'unknown'})`,
    );
  }
}

function computeSha256Hex(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}
