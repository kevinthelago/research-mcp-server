import { createHash } from 'node:crypto';
import PQueue from 'p-queue';
import type {
  AdapterCandidate,
  CitationConfig,
  ISearchAdapter,
  ParsedReference,
  ReferenceQuery,
  ReferenceResolution,
} from './types.js';
import { scoreCandidate } from './scoring.js';

const DEFAULT_THRESHOLD = 0.75;

/**
 * Resolves a batch of parsed references to canonical identifiers by querying
 * Crossref and Semantic Scholar, scoring candidates, and accepting the best
 * result above the configured confidence threshold.
 *
 * Designed for injection of adapter instances from the search stream; swap in
 * real CrossrefAdapter / SemanticScholarAdapter once that stream lands.
 */
export class CitationResolver {
  private readonly threshold: number;
  private readonly crossrefQueue: PQueue;
  private readonly s2Queue: PQueue;

  constructor(
    private readonly crossref: ISearchAdapter,
    private readonly semanticScholar: ISearchAdapter,
    config: CitationConfig = {},
  ) {
    this.threshold = config.confidenceThreshold ?? DEFAULT_THRESHOLD;
    // Crossref polite pool: generous but respectful
    this.crossrefQueue = new PQueue({ concurrency: 3, interval: 1000, intervalCap: 10 });
    // Semantic Scholar: conservative without an API key
    this.s2Queue = new PQueue({ concurrency: 1, interval: 1000, intervalCap: 5 });
  }

  /**
   * Resolve a batch of references. One reference's failure never aborts others.
   */
  async resolveAll(references: ParsedReference[]): Promise<ReferenceResolution[]> {
    const settled = await Promise.allSettled(references.map(r => this.resolveOne(r)));
    return settled.map((result, i) => {
      if (result.status === 'fulfilled') return result.value;
      return {
        reference: references[i]!,
        resolvedId: null,
        confidence: 0,
        status: 'error' as const,
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      };
    });
  }

  /** Resolve a single reference. Never rejects — errors map to status:'error'. */
  async resolveOne(reference: ParsedReference): Promise<ReferenceResolution> {
    if (reference.doi) {
      return { reference, resolvedId: `doi:${reference.doi}`, confidence: 1.0, status: 'resolved' };
    }
    if (reference.arxivId) {
      return { reference, resolvedId: `arxiv:${reference.arxivId}`, confidence: 1.0, status: 'resolved' };
    }

    const query: ReferenceQuery = {
      rawString: reference.rawString,
      ...(reference.title !== undefined && { title: reference.title }),
      ...(reference.authors !== undefined && { authors: reference.authors }),
      ...(reference.year !== undefined && { year: reference.year }),
      ...(reference.doi !== undefined && { doi: reference.doi }),
    };

    const [crossrefResult, s2Result] = await Promise.allSettled([
      this.crossrefQueue.add(() => this.crossref.resolve(query)),
      this.s2Queue.add(() => this.semanticScholar.resolve(query)),
    ]);

    const candidates: AdapterCandidate[] = [
      ...(crossrefResult.status === 'fulfilled' ? crossrefResult.value ?? [] : []),
      ...(s2Result.status === 'fulfilled' ? s2Result.value ?? [] : []),
    ];

    if (candidates.length === 0) {
      return { reference, resolvedId: null, confidence: 0, status: 'unresolved' };
    }

    let best: AdapterCandidate | null = null;
    let bestScore = 0;

    for (const candidate of candidates) {
      const score = scoreCandidate(reference, candidate);
      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
    }

    if (bestScore >= this.threshold && best !== null) {
      return { reference, resolvedId: best.id, confidence: bestScore, status: 'resolved' };
    }

    return { reference, resolvedId: null, confidence: bestScore, status: 'unresolved' };
  }
}

/**
 * Stable 16-hex cache key for a reference. Based on its stable identifying
 * fields so the same reference in different documents hits the same cache entry.
 */
export function referenceHash(ref: ParsedReference): string {
  const payload = JSON.stringify({
    raw: ref.rawString,
    title: ref.title,
    authors: ref.authors ? [...ref.authors].sort() : undefined,
    year: ref.year,
    doi: ref.doi,
    arxivId: ref.arxivId,
  });
  return createHash('sha256').update(payload).digest('hex').slice(0, 16);
}
