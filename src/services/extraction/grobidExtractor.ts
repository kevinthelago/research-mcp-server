import { readFile } from 'node:fs/promises';
import { fetch, FormData, File } from 'undici';
import { makeGrobidUnavailableError } from '../../models/document.js';
import { parseTeiXml } from './teiParser.js';
import type { ExtractResult, Extractor, RetrievedPaper } from './types.js';

export interface GrobidExtractorOptions {
  baseUrl: string;
  /** consolidateHeader: 0=off, 1=on, 2=full. Default 1. */
  consolidateHeader?: 0 | 1 | 2;
  /** consolidateCitations: 0=off, 1=on. Default 1. */
  consolidateCitations?: 0 | 1;
  /** Request timeout in ms. Default 120_000. */
  timeoutMs?: number;
}

const HEALTH_PATH = '/api/isalive';
const PROCESS_PATH = '/api/processFulltextDocument';

export class GrobidExtractor implements Extractor {
  private readonly baseUrl: string;
  private readonly consolidateHeader: number;
  private readonly consolidateCitations: number;
  private readonly timeoutMs: number;

  constructor(opts: GrobidExtractorOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, '');
    this.consolidateHeader = opts.consolidateHeader ?? 1;
    this.consolidateCitations = opts.consolidateCitations ?? 1;
    this.timeoutMs = opts.timeoutMs ?? 120_000;
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}${HEALTH_PATH}`, {
        signal: AbortSignal.timeout(5_000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async extract(paper: RetrievedPaper): Promise<ExtractResult> {
    if (!paper.pdfPath) {
      // Caller should have checked hasFullText first; this is a code-path guard.
      // Return unavailable-style error so callers handle it uniformly.
      return {
        ok: false,
        error: makeGrobidUnavailableError(
          `Paper "${paper.canonicalId}" has no stored PDF path.`,
        ),
      };
    }

    let pdfBytes: Buffer;
    try {
      pdfBytes = await readFile(paper.pdfPath);
    } catch (err) {
      return {
        ok: false,
        error: makeGrobidUnavailableError(
          `Could not read PDF at "${paper.pdfPath}": ${(err as Error).message}`,
        ),
      };
    }

    const form = new FormData();
    form.append(
      'input',
      new File([pdfBytes], 'paper.pdf', { type: 'application/pdf' }),
    );
    form.append('consolidateHeader', String(this.consolidateHeader));
    form.append('consolidateCitations', String(this.consolidateCitations));
    form.append('includeRawCitations', '1');

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${PROCESS_PATH}`, {
        method: 'POST',
        body: form,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      return {
        ok: false,
        error: makeGrobidUnavailableError(
          `GROBID request failed: ${(err as Error).message}`,
        ),
      };
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      return {
        ok: false,
        error: makeGrobidUnavailableError(
          `GROBID returned HTTP ${response.status}: ${body.slice(0, 200)}`,
        ),
      };
    }

    const xml = await response.text();
    const document = parseTeiXml(paper.canonicalId, xml);

    // Backfill metadata from the retrieval layer where GROBID left gaps
    if (!document.metadata.title && paper.metadata.title) {
      document.metadata.title = paper.metadata.title;
    }
    if (document.metadata.authors.length === 0 && paper.metadata.authors?.length) {
      document.metadata.authors = paper.metadata.authors;
    }
    if (!document.metadata.doi && paper.metadata.doi) {
      document.metadata.doi = paper.metadata.doi;
    }
    if (!document.metadata.arxivId && paper.metadata.arxivId) {
      document.metadata.arxivId = paper.metadata.arxivId;
    }
    if (!document.metadata.year && paper.metadata.year) {
      document.metadata.year = paper.metadata.year;
    }

    return { ok: true, document };
  }
}
