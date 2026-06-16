import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CrossrefAdapter } from './CrossrefAdapter.js'

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

function mockJson(body: unknown, status = 200) {
  return vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

describe('CrossrefAdapter', () => {
  let adapter: CrossrefAdapter

  beforeEach(() => {
    adapter = new CrossrefAdapter()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('search() parses list response correctly', async () => {
    vi.stubGlobal('fetch', mockJson({ message: { items: [WORK] } }))
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

  it('search() returns empty array on 404', async () => {
    vi.stubGlobal('fetch', mockJson({}, 404))
    const results = await adapter.search({ query: 'nothing' })
    expect(results).toHaveLength(0)
  })

  it('fetch() by DOI returns record', async () => {
    vi.stubGlobal('fetch', mockJson({ message: WORK }))
    const result = await adapter.fetch({ doi: '10.5555/1234567' })
    expect(result).not.toBeNull()
    expect(result!.ids.doi).toBe('10.5555/1234567')
  })

  it('fetch() returns null on 404', async () => {
    vi.stubGlobal('fetch', mockJson({}, 404))
    const result = await adapter.fetch({ doi: 'bad/doi' })
    expect(result).toBeNull()
  })

  it('fetch() returns null with no doi param', async () => {
    const result = await adapter.fetch({})
    expect(result).toBeNull()
  })

  it('resolve() by rawRef returns first result', async () => {
    vi.stubGlobal('fetch', mockJson({ message: { items: [WORK] } }))
    const result = await adapter.resolve({ rawRef: 'Jumper et al. AlphaFold Nature 2021' })
    expect(result).not.toBeNull()
    expect(result!.year).toBe(2021)
  })

  it('resolve() returns null with no usable params', async () => {
    const result = await adapter.resolve({})
    expect(result).toBeNull()
  })
})
