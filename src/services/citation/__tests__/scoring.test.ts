import { describe, it, expect } from 'vitest';
import { scoreCandidate } from '../scoring.js';
import type { ParsedReference, AdapterCandidate } from '../types.js';

function ref(overrides: Partial<ParsedReference> = {}): ParsedReference {
  return {
    rawString: '',
    resolvedId: null,
    confidence: 0,
    ...overrides,
  };
}

function candidate(overrides: Partial<AdapterCandidate> & { id?: string } = {}): AdapterCandidate {
  return { id: 'doi:10.1234/test', ...overrides };
}

describe('scoreCandidate', () => {
  it('returns 0 when either title is missing', () => {
    expect(scoreCandidate(ref({ authors: ['Smith'] }), candidate({ title: 'A paper' }))).toBe(0);
    expect(scoreCandidate(ref({ title: 'A paper' }), candidate())).toBe(0);
  });

  it('returns ~1 for identical title + authors + year', () => {
    const score = scoreCandidate(
      ref({ title: 'Attention Is All You Need', authors: ['Vaswani', 'Shazeer'], year: 2017 }),
      candidate({ title: 'Attention Is All You Need', authors: ['Vaswani', 'Shazeer'], year: 2017 }),
    );
    expect(score).toBeGreaterThan(0.95);
  });

  it('returns low score for completely different title', () => {
    const score = scoreCandidate(
      ref({ title: 'Attention Is All You Need' }),
      candidate({ title: 'Deep Residual Learning for Image Recognition' }),
    );
    expect(score).toBeLessThan(0.25);
  });

  it('penalises off-by-one year vs exact year', () => {
    const exact = scoreCandidate(
      ref({ title: 'BERT Pre-training', authors: ['Devlin'], year: 2018 }),
      candidate({ title: 'BERT Pre-training', authors: ['Devlin'], year: 2018 }),
    );
    const offByOne = scoreCandidate(
      ref({ title: 'BERT Pre-training', authors: ['Devlin'], year: 2018 }),
      candidate({ title: 'BERT Pre-training', authors: ['Devlin'], year: 2019 }),
    );
    expect(exact).toBeGreaterThan(offByOne);
  });

  it('gives partial credit for surname-only author match', () => {
    const surnameFull = scoreCandidate(
      ref({ title: 'A paper', authors: ['John Smith'] }),
      candidate({ title: 'A paper', authors: ['J. Smith'] }),
    );
    const noMatch = scoreCandidate(
      ref({ title: 'A paper', authors: ['John Smith'] }),
      candidate({ title: 'A paper', authors: ['Jane Doe'] }),
    );
    expect(surnameFull).toBeGreaterThan(noMatch);
  });

  it('is case and punctuation insensitive for title', () => {
    // Title-only gives at most 0.60 (title weight); add year to push the score higher
    const score = scoreCandidate(
      ref({ title: 'GPT-4: Technical Report', authors: ['OpenAI'], year: 2023 }),
      candidate({ title: 'gpt 4 technical report', authors: ['OpenAI'], year: 2023 }),
    );
    expect(score).toBeGreaterThan(0.85);
  });
});
