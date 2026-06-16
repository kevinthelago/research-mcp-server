import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ArxivAdapter } from './ArxivAdapter.js'

const FIXTURE_SINGLE = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:arxiv="http://arxiv.org/schemas/atom">
  <entry>
    <id>http://arxiv.org/abs/2301.00001v2</id>
    <title>Attention Is All You Need</title>
    <summary>We propose a new simple network architecture, the Transformer.</summary>
    <author><name>Ashish Vaswani</name></author>
    <author><name>Noam Shazeer</name></author>
    <published>2023-01-01T00:00:00Z</published>
    <arxiv:doi>10.48550/arXiv.2301.00001</arxiv:doi>
    <link title="pdf" href="https://arxiv.org/pdf/2301.00001"/>
    <arxiv:journal_ref>NeurIPS 2023</arxiv:journal_ref>
  </entry>
</feed>`

const FIXTURE_EMPTY = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
</feed>`

function mockFetch(body: string, status = 200) {
  return vi.fn().mockResolvedValue(
    new Response(body, {
      status,
      headers: { 'Content-Type': 'application/xml' },
    }),
  )
}

describe('ArxivAdapter', () => {
  let adapter: ArxivAdapter

  beforeEach(() => {
    adapter = new ArxivAdapter()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('search() parses a single entry correctly', async () => {
    vi.stubGlobal('fetch', mockFetch(FIXTURE_SINGLE))
    const results = await adapter.search({ query: 'attention transformer' })

    expect(results).toHaveLength(1)
    const r = results[0]!
    expect(r.title).toBe('Attention Is All You Need')
    expect(r.ids.arxivId).toBe('2301.00001')
    expect(r.ids.doi).toBe('10.48550/arXiv.2301.00001')
    expect(r.authors).toEqual(['Ashish Vaswani', 'Noam Shazeer'])
    expect(r.abstract).toContain('Transformer')
    expect(r.year).toBe(2023)
    expect(r.venue).toBe('NeurIPS 2023')
    expect(r.openAccessPdfUrl).toBe('https://arxiv.org/pdf/2301.00001')
    expect(r.sources).toContain('arxiv')
  })

  it('search() returns empty array for empty feed', async () => {
    vi.stubGlobal('fetch', mockFetch(FIXTURE_EMPTY))
    const results = await adapter.search({ query: 'nothing' })
    expect(results).toHaveLength(0)
  })

  it('fetch() by arxivId strips version suffix', async () => {
    vi.stubGlobal('fetch', mockFetch(FIXTURE_SINGLE))
    const result = await adapter.fetch({ arxivId: '2301.00001v2' })
    expect(result).not.toBeNull()
    expect(result!.ids.arxivId).toBe('2301.00001')
  })

  it('fetch() returns null when feed is empty', async () => {
    vi.stubGlobal('fetch', mockFetch(FIXTURE_EMPTY))
    const result = await adapter.fetch({ arxivId: '9999.99999' })
    expect(result).toBeNull()
  })

  it('fetch() returns null when no params match', async () => {
    const result = await adapter.fetch({})
    expect(result).toBeNull()
  })

  it('resolve() by title returns first result', async () => {
    vi.stubGlobal('fetch', mockFetch(FIXTURE_SINGLE))
    const result = await adapter.resolve({ title: 'Attention Is All You Need' })
    expect(result).not.toBeNull()
    expect(result!.title).toBe('Attention Is All You Need')
  })
})
