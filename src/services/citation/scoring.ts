import { compareTwoStrings } from 'string-similarity';
import type { AdapterCandidate, ParsedReference } from './types.js';

const WEIGHTS = { title: 0.60, authors: 0.25, year: 0.15 } as const;

/**
 * Score a resolution candidate against the source reference.
 * Returns a value in [0, 1]. If no title is available on either side,
 * returns 0 — title is the primary signal.
 */
export function scoreCandidate(
  ref: ParsedReference,
  candidate: AdapterCandidate,
): number {
  if (!ref.title || !candidate.title) return 0;

  const titleScore = compareTwoStrings(
    normalizeTitle(ref.title),
    normalizeTitle(candidate.title),
  );

  const authorScore =
    ref.authors?.length && candidate.authors?.length
      ? scoreAuthors(ref.authors, candidate.authors)
      : 0;

  const yearScore = scoreYear(ref.year, candidate.year);

  return (
    titleScore * WEIGHTS.title +
    authorScore * WEIGHTS.authors +
    yearScore * WEIGHTS.year
  );
}

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function scoreAuthors(refAuthors: string[], candidateAuthors: string[]): number {
  const refNorm = refAuthors.map(normalizeAuthor);
  const candNorm = candidateAuthors.map(normalizeAuthor);
  const refSet = new Set(refNorm);
  const candSet = new Set(candNorm);

  let overlap = 0;
  for (const a of refSet) {
    if (candSet.has(a)) {
      overlap += 1;
    } else {
      // Partial credit for surname match
      const surname = a.split(' ').at(-1) ?? a;
      if (surname.length > 2 && [...candSet].some(c => c.split(' ').at(-1) === surname)) {
        overlap += 0.5;
      }
    }
  }

  return overlap / Math.max(refSet.size, candSet.size);
}

function normalizeAuthor(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function scoreYear(refYear: number | undefined, candidateYear: number | undefined): number {
  if (!refYear || !candidateYear) return 0;
  const diff = Math.abs(refYear - candidateYear);
  if (diff === 0) return 1.0;
  if (diff === 1) return 0.5;
  return 0;
}
