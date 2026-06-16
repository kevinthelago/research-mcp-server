import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CrossrefAdapter } from './CrossrefAdapter'

vi.mock('../../util/fetcher', () => ({
  guardedFetch: vi.fn(),
  FetchError: class FetchError extends Error {
    constructor(message: string, public code: string) { super(message) }
  },
}))

import { guardedFetch } from '../../util/fetcher'
const mockFetch = vi.mocked(guardedFetch)

const WORK = {
  DOI: '10.5555/1234567',
  title: ['Protein Folding Prediction with AlphaFold'],
  author: [{ given: 'John', family: 'Jumper' }, { given: 'Richard', family: 'Evans' }],
  issued: { 'date-parts': [[2021, 7, 15]] },
  'container-title': ['Nature'],
  'is-referenced-by-count': 3000,
  URL: 'https://doi.org/10.5555/1234567',
  abstract: 'We present AlphaFold...',
}

function mockJson(body: unknown) {
  mockFetch.mockResolvedValue({
    body: Buffer.from(JSON.stringify(body)),
    contentType: 'application/json',
    status: 200,
    url: 'https://api.crossref.org',
  })
}

describe('CrossrefAdapter', () => {
  let adapter: CrossrefAdapter

  beforeEach(() => {
    adapter = new CrossrefAdapter()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('search() parses list response correctly', async () => {
    mockJson({ message: { items: [WORK] } })
    const results = await adapter.search({ query: 'protein folding alphafold' })

    expect(results).toHaveLength(1)
    const r = results[0]!
    expect(r.ids.doi).toBe('10.5555/1234567')
    expect(r.title).toBe('Protein Folding Prediction with AlphaFold')
    expect(r.authors).toEqual(['John Jumper', 'Richard Evans'])
    expect(r.year).toBe(2021)
    expect(r.venue).toBe('Nature')
    expect(r.citationCount).toBe(3000)
    expect(r.sources).toContain('crossref')
  })

  it('search() returns empty array on HTTP error', async () => {
    mockFetch.mockRejectedValue(new Error('HTTP 404'))
    const results = await adapter.search({ query: 'nothing' })
    expect(results).toHaveLength(0)
  })

  it('fetch() (FetchParams) by DOI returns record', async () => {
    mockJson({ message: WORK })
    const result = await adapter.fetch({ doi: '10.5555/1234567' })
    expect(result).not.toBeNull()
    expect((result as import('../../models/record').UnifiedRecord).ids.doi).toBe('10.5555/1234567')
  })

  it('fetch() (NormalizedId) by DOI returns SourceResult', async () => {
    mockJson({ message: WORK })
    const result = await adapter.fetch({ type: 'doi', canonical: '10.5555/1234567', raw: '10.5555/1234567' })
    expect(result).not.toBeNull()
    expect((result as import('../../contracts/search').SourceResult).metadata.doi).toBe('10.5555/1234567')
  })

  it('fetch() (NormalizedId) non-doi type returns null without network call', async () => {
    const result = await adapter.fetch({ type: 'arxiv', canonical: '1706.03762', raw: '1706.03762' })
    expect(result).toBeNull()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('fetch() returns null on HTTP error', async () => {
    mockFetch.mockRejectedValue(new Error('HTTP 404'))
    const result = await adapter.fetch({ doi: 'bad/doi' })
    expect(result).toBeNull()
  })

  it('fetch() returns null with no doi param', async () => {
    const result = await adapter.fetch({})
    expect(result).toBeNull()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('resolve() by rawRef returns first result', async () => {
    mockJson({ message: { items: [WORK] } })
    const result = await adapter.resolve({ rawRef: 'Jumper et al. AlphaFold Nature 2021' })
    expect(result).not.toBeNull()
    expect(result!.year).toBe(2021)
  })

  it('resolve() returns null with no usable params', async () => {
    const result = await adapter.resolve({})
    expect(result).toBeNull()
    expect(mockFetch).not.toHaveBeenCalled()
  })
})
