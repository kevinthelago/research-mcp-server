import type { PaperCache, BlobStore } from '../../contracts/persistence.js';
import type { SourceAdapter } from '../../contracts/search.js';
import { detectAndNormalize, type NormalizedId } from '../../util/identifiers.js';
import { guardedFetch } from '../../util/fetcher.js';
import type { RetrievedPaper, PaperSource } from '../../models/retrievedPaper.js';

export class NotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`Paper not found: ${id}`);
    this.name = 'NotFoundError';
  }
}

export class UnrecognizedIdError extends Error {
  constructor(public readonly raw: string) {
    super(`Cannot parse identifier: ${raw}`);
    this.name = 'UnrecognizedIdError';
  }
}

export interface RetrievalServiceDeps {
  cache: PaperCache;
  blobStore: BlobStore;
  /** Ordered list of source adapters to try. First match wins. */
  sources: SourceAdapter[];
}

function sourceFromIdType(type: NormalizedId['type']): PaperSource {
  switch (type) {
    case 'doi': return 'crossref';
    case 'arxiv': return 'arxiv';
    case 'pmid': return 'pubmed';
    case 'pmcid': return 'pubmed';
    case 'url': return 'url';
  }
}

export class RetrievalService {
  constructor(private readonly deps: RetrievalServiceDeps) {}

  /**
   * Resolve an identifier to a RetrievedPaper.
   *
   * Resolution order:
   * 1. Normalize the raw id string.
   * 2. Check the cache.
   * 3. Try each source adapter in order; first non-null result wins.
   * 4. If an OA PDF URL was returned, fetch and store the PDF.
   * 5. Cache the result and return it.
   *
   * Throws UnrecognizedIdError when the id cannot be parsed.
   * Throws NotFoundError when no source can resolve the id.
   */
  async retrieve(rawId: string): Promise<RetrievedPaper> {
    const normalized = detectAndNormalize(rawId);
    if (normalized == null) {
      throw new UnrecognizedIdError(rawId);
    }

    const { canonical } = normalized;

    // Cache hit
    const cached = await this.deps.cache.get(canonical);
    if (cached != null) return cached;

    // Try each source adapter
    let sourceResult: Awaited<ReturnType<SourceAdapter['fetch']>> = null;
    for (const adapter of this.deps.sources) {
      sourceResult = await adapter.fetch(normalized);
      if (sourceResult != null) break;
    }

    if (sourceResult == null) {
      throw new NotFoundError(rawId);
    }

    const { metadata, openAccessPdfUrl } = sourceResult;

    // Attempt to download OA PDF
    let pdfPath: string | undefined;
    let hasFullText = false;

    if (openAccessPdfUrl != null) {
      try {
        const result = await guardedFetch(openAccessPdfUrl);
        const sha256 = await computeSha256Hex(result.body);
        pdfPath = await this.deps.blobStore.store(result.body, sha256);
        hasFullText = true;
      } catch {
        // OA PDF unavailable is not an error — hasFullText stays false
      }
    }

    const paper: RetrievedPaper = {
      canonicalId: canonical,
      metadata,
      ...(pdfPath != null ? { pdfPath } : {}),
      hasFullText,
      source: sourceFromIdType(normalized.type),
    };

    await this.deps.cache.set(paper);
    return paper;
  }
}

async function computeSha256Hex(buf: Buffer): Promise<string> {
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(buf).digest('hex');
}
