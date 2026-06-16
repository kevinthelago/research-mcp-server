import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PubMedAdapter } from './PubMedAdapter.js'

const ESEARCH_RESPONSE = {
  esearchresult: { idlist: ['12345678'] },
}

const ESUMMARY_RESPONSE = {
  result: {
    '12345678': {
      uid: '12345678',
      title: 'CRISPR-Cas9 for Genome Editing',
      authors: [{ name: 'Jennifer Doudna' }, { name: 'Emmanuelle Charpentier' }],
      pubdate: '2012 Aug 17',
      fulljournalname: 'Science',
      source: 'Science',
      articleids: [{ idtype: 'doi', value: '10.1126/science.1225829' }],
    },
  },
}

function mockFetchSequence(responses: { body: unknown; status?: number }[]) {
  let callCount = 0
  return vi.fn().mockImplementation(() => {
    const r = responses[callCount++] ?? responses[responses.length - 1]!
    return Promise.resolve(
      new Response(JSON.stringify(r.body), {
        status: r.status ?? 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
  })
}

describe('PubMedAdapter', () => {
  let adapter: PubMedAdapter

  beforeEach(() => {
    adapter = new PubMedAdapter()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('search() performs esearch then esummary and parses correctly', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchSequence([{ body: ESEARCH_RESPONSE }, { body: ESUMMARY_RESPONSE }]),
    )
    const results = await adapter.search({ query: 'CRISPR genome editing' })

    expect(results).toHaveLength(1)
    const r = results[0]!
    expect(r.ids.pmid).toBe('12345678')
    expect(r.ids.doi).toBe('10.1126/science.1225829')
    expect(r.title).toBe('CRISPR-Cas9 for Genome Editing')
    expect(r.authors).toEqual(['Jennifer Doudna', 'Emmanuelle Charpentier'])
    expect(r.year).toBe(2012)
    expect(r.venue).toBe('Science')
    expect(r.sources).toContain('pubmed')
  })

  it('search() returns empty array when idlist is empty', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchSequence([{ body: { esearchresult: { idlist: [] } } }]),
    )
    const results = await adapter.search({ query: 'nothing found here' })
    expect(results).toHaveLength(0)
  })

  it('fetch() by pmid returns record', async () => {
    vi.stubGlobal('fetch', mockFetchSequence([{ body: ESUMMARY_RESPONSE }]))
    const result = await adapter.fetch({ pmid: '12345678' })
    expect(result).not.toBeNull()
    expect(result!.ids.pmid).toBe('12345678')
  })

  it('fetch() returns null with no matching params', async () => {
    const result = await adapter.fetch({})
    expect(result).toBeNull()
  })
})
