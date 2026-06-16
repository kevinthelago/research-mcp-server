import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IngestService, InvalidPdfError, PdfTooLargeError } from '../../services/retrieval/ingestService.js';
import type { BlobStore } from '../../contracts/persistence.js';

function makeMockBlobStore(): BlobStore {
  return {
    store: vi.fn(async (_buf: Buffer, sha256: string) => `/blobs/${sha256}.pdf`),
  };
}

/** Minimal valid PDF header */
const VALID_PDF_HEADER = Buffer.from('%PDF-1.4 \n1 0 obj\n<</Type /Catalog>>\nendobj\n%%EOF\n');

/** A buffer that does NOT start with %PDF */
const NOT_PDF = Buffer.from('This is not a PDF file at all');

describe('IngestService', () => {
  let blobStore: BlobStore;
  let service: IngestService;

  beforeEach(() => {
    vi.clearAllMocks();
    blobStore = makeMockBlobStore();
    service = new IngestService({ blobStore });
  });

  describe('ingest(Buffer)', () => {
    it('accepts a valid PDF buffer', async () => {
      const result = await service.ingest(VALID_PDF_HEADER);
      expect(result.hasFullText).toBe(true);
      expect(result.source).toBe('user_upload');
      expect(result.pdfPath).toBeDefined();
    });

    it('mints a sha256: canonical id', async () => {
      const result = await service.ingest(VALID_PDF_HEADER);
      expect(result.canonicalId).toMatch(/^sha256:[0-9a-f]{64}$/);
    });

    it('is idempotent — same bytes → same canonical id', async () => {
      const result1 = await service.ingest(VALID_PDF_HEADER);
      const result2 = await service.ingest(VALID_PDF_HEADER);
      expect(result1.canonicalId).toBe(result2.canonicalId);
    });

    it('rejects a buffer that is not a PDF', async () => {
      await expect(service.ingest(NOT_PDF)).rejects.toThrow(InvalidPdfError);
    });

    it('rejects an empty buffer', async () => {
      await expect(service.ingest(Buffer.alloc(0))).rejects.toThrow(InvalidPdfError);
    });

    it('rejects a buffer exceeding the 200 MB size cap', async () => {
      const huge = Buffer.alloc(201 * 1024 * 1024);
      // Make first bytes look like a PDF so it fails at size check, not magic-bytes check
      huge.write('%PDF', 0);
      await expect(service.ingest(huge)).rejects.toThrow(PdfTooLargeError);
    });

    it('stores the PDF via blobStore', async () => {
      await service.ingest(VALID_PDF_HEADER);
      expect(blobStore.store).toHaveBeenCalledWith(
        VALID_PDF_HEADER,
        expect.stringMatching(/^[0-9a-f]{64}$/),
      );
    });
  });

  describe('ingestBase64', () => {
    it('decodes base64 and ingests valid PDF', async () => {
      const b64 = VALID_PDF_HEADER.toString('base64');
      const result = await service.ingestBase64(b64);
      expect(result.hasFullText).toBe(true);
      expect(result.source).toBe('user_upload');
    });

    it('rejects base64-encoded non-PDF content', async () => {
      const b64 = NOT_PDF.toString('base64');
      await expect(service.ingestBase64(b64)).rejects.toThrow(InvalidPdfError);
    });
  });
});
