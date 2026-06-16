import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PubMedAdapter } from './PubMedAdapter'

vi.mock('../../util/fetcher', () => ({
  guardedFetch: vi.fn(),
  FetchError: class FetchError extends Error {
    constructor(message: string, public code: string) { super(message) }
  },
}))

import { guardedFetch } from '../../util/fetcher'
const mockFetch = vi.mocked(guardedFetch)

const ESEARCH_RESPONSE = { esearchresult: { idlist: ['12345678'] } }
const ESUMMARY_RESPONSE = {
  result: {
    '12345678': {
      uid: '12345678',
      title: 'CRISPR-Cas9 for Genome Editing',
      authors: [{ name: 'Jennifer Doudna' }, { name: 'Emmanuelle Charpentier' }],
      pubdate: '2012 Aug 17',
      fulljournalname: 'Science',
      source: 'Science',
      articleids: [
        { idtype: 'doi', value: '10.1126/science.1225829' },
        { idtype: 'pmc', value: '3795411' },
      ],
    },
  },
}

function mockSequence(responses: unknown[]) {
  let i = 0
  mockFetch.mockImplementation(() => {
    const body = responses[i++] ?? responses[responses.length - 1]!
    return Promise.resolve({
      body: Buffer.from(JSON.stringify(body)),
      contentType: 'application/json',
      status: 200,
      url: 'https://eutils.ncbi.nlm.nih.gov',
    })
  })
}

describe('PubMedAdapter', () => {
  let adapter: PubMedAdapter

  beforeEach(() => {
    adapter = new PubMedAdapter()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('search() performs esearch then esummary and parses correctly', async () => {
    mockSequence([ESEARCH_RESPONSE, ESUMMARY_RESPONSE])
    const results = await adapter.search({ query: 'CRISPR genome editing' })

    expect(results).toHaveLength(1)
    const r = results[0]!
    expect(r.ids.pmid).toBe('12345678')
    expect(r.ids.doi).toBe('10.1126/science.1225829')
    expect(r.ids.pmcid).toBe('PMC3795411')
    expect(r.title).toBe('CRISPR-Cas9 for Genome Editing')
    expect(r.authors).toEqual(['Jennifer Doudna', 'Emmanuelle Charpentier'])
    expect(r.year).toBe(2012)
    expect(r.venue).toBe('Science')
    expect(r.sources).toContain('pubmed')
  })

  it('search() returns empty array when idlist is empty', async () => {
    mockSequence([{ esearchresult: { idlist: [] } }])
    const results = await adapter.search({ query: 'nothing found here' })
    expect(results).toHaveLength(0)
  })

  it('fetch() (FetchParams) by pmid returns record', async () => {
    mockSequence([ESUMMARY_RESPONSE])
    const result = await adapter.fetch({ pmid: '12345678' })
    expect(result).not.toBeNull()
    expect((result as import('../../models/record').UnifiedRecord).ids.pmid).toBe('12345678')
  })

  it('fetch() (NormalizedId) by pmid returns SourceResult', async () => {
    mockSequence([ESUMMARY_RESPONSE])
    const result = await adapter.fetch({ type: 'pmid', canonical: '12345678', raw: '12345678' })
    expect(result).not.toBeNull()
    expect((result as import('../../contracts/search').SourceResult).metadata.pmid).toBe('12345678')
  })

  it('fetch() returns null with no matching params', async () => {
    const result = await adapter.fetch({})
    expect(result).toBeNull()
    expect(mockFetch).not.toHaveBeenCalled()
  })
})
