import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SemanticScholarAdapter } from './SemanticScholarAdapter.js'

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

function mockJson(body: unknown, status = 200) {
  return vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

describe('SemanticScholarAdapter', () => {
  let adapter: SemanticScholarAdapter

  beforeEach(() => {
    adapter = new SemanticScholarAdapter()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('search() parses results correctly', async () => {
    vi.stubGlobal('fetch', mockJson({ data: [PAPER] }))
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

  it('search() returns empty array on 404', async () => {
    vi.stubGlobal('fetch', mockJson({ message: 'not found' }, 404))
    const results = await adapter.search({ query: 'nothing' })
    expect(results).toHaveLength(0)
  })

  it('fetch() by DOI returns record', async () => {
    vi.stubGlobal('fetch', mockJson(PAPER))
    const result = await adapter.fetch({ doi: '10.5555/3295222.3295349' })
    expect(result).not.toBeNull()
    expect(result!.ids.doi).toBe('10.5555/3295222.3295349')
  })

  it('fetch() returns null on 404', async () => {
    vi.stubGlobal('fetch', mockJson({ message: 'paper not found' }, 404))
    const result = await adapter.fetch({ doi: 'bad/doi' })
    expect(result).toBeNull()
  })

  it('fetch() returns null with no params', async () => {
    const result = await adapter.fetch({})
    expect(result).toBeNull()
  })

  it('resolve() by title returns first result', async () => {
    vi.stubGlobal('fetch', mockJson({ data: [PAPER] }))
    const result = await adapter.resolve({ title: 'Attention Is All You Need' })
    expect(result).not.toBeNull()
    expect(result!.title).toBe('Attention Is All You Need')
  })
})
