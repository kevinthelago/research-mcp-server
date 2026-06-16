import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SemanticScholarAdapter } from './SemanticScholarAdapter'

vi.mock('../../util/fetcher', () => ({
  guardedFetch: vi.fn(),
  FetchError: class FetchError extends Error {
    constructor(message: string, public code: string) { super(message) }
  },
}))

import { guardedFetch } from '../../util/fetcher'
const mockFetch = vi.mocked(guardedFetch)

const PAPER = {
  paperId: 's2-abc123',
  title: 'Attention Is All You Need',
  authors: [{ authorId: '1', name: 'Ashish Vaswani' }, { authorId: '2', name: 'Noam Shazeer' }],
  year: 2017,
  abstract: 'We propose the Transformer architecture.',
  externalIds: { DOI: '10.5555/3295222.3295349', ArXiv: '1706.03762' },
  publicationVenue: { name: 'NeurIPS' },
  citationCount: 50000,
  openAccessPdf: { url: 'https://arxiv.org/pdf/1706.03762' },
}

function mockJson(body: unknown) {
  mockFetch.mockResolvedValue({
    body: Buffer.from(JSON.stringify(body)),
    contentType: 'application/json',
    status: 200,
    url: 'https://api.semanticscholar.org/graph/v1/paper/search',
  })
}

class MockFetchError extends Error {
  constructor(message: string, public code: string) { super(message) }
}

function mockFetchError(status: number) {
  mockFetch.mockRejectedValue(new MockFetchError(`HTTP ${status} from url`, 'HTTP_ERROR'))
}

describe('SemanticScholarAdapter', () => {
  let adapter: SemanticScholarAdapter

  beforeEach(() => {
    adapter = new SemanticScholarAdapter()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('search() parses results correctly', async () => {
    mockJson({ data: [PAPER] })
    const results = await adapter.search({ query: 'attention transformer' })

    expect(results).toHaveLength(1)
    const r = results[0]!
    expect(r.title).toBe('Attention Is All You Need')
    expect(r.ids.s2Id).toBe('s2-abc123')
    expect(r.ids.doi).toBe('10.5555/3295222.3295349')
    expect(r.ids.arxivId).toBe('1706.03762')
    expect(r.authors).toEqual(['Ashish Vaswani', 'Noam Shazeer'])
    expect(r.citationCount).toBe(50000)
    expect(r.venue).toBe('NeurIPS')
    expect(r.openAccessPdfUrl).toBe('https://arxiv.org/pdf/1706.03762')
    expect(r.sources).toContain('semantic-scholar')
  })

  it('search() returns empty array on HTTP error', async () => {
    mockFetch.mockRejectedValue(new Error('HTTP 404 from url'))
    const results = await adapter.search({ query: 'nothing' })
    expect(results).toHaveLength(0)
  })

  it('fetch() (FetchParams) by DOI returns record', async () => {
    mockJson(PAPER)
    const result = await adapter.fetch({ doi: '10.5555/3295222.3295349' })
    expect(result).not.toBeNull()
    expect((result as import('../../models/record').UnifiedRecord).ids.doi).toBe('10.5555/3295222.3295349')
  })

  it('fetch() (NormalizedId) by DOI returns SourceResult', async () => {
    mockJson(PAPER)
    const result = await adapter.fetch({ type: 'doi', canonical: '10.5555/3295222.3295349', raw: '10.5555/3295222.3295349' })
    expect(result).not.toBeNull()
    expect((result as import('../../contracts/search').SourceResult).metadata.doi).toBe('10.5555/3295222.3295349')
  })

  it('fetch() returns null on HTTP error', async () => {
    mockFetch.mockRejectedValue(new Error('HTTP 404 from url'))
    const result = await adapter.fetch({ doi: 'bad/doi' })
    expect(result).toBeNull()
  })

  it('fetch() returns null with no params', async () => {
    const result = await adapter.fetch({})
    expect(result).toBeNull()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('resolve() by title returns first result', async () => {
    mockJson({ data: [PAPER] })
    const result = await adapter.resolve({ title: 'Attention Is All You Need' })
    expect(result).not.toBeNull()
    expect(result!.title).toBe('Attention Is All You Need')
  })
})
