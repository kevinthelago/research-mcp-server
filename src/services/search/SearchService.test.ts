import { describe, expect, it, vi } from 'vitest'
import type { SourceAdapter } from '../../sources/index.js'
import type { UnifiedRecord } from '../../models/record.js'
import { MemoryCache, SearchService } from './SearchService.js'

function makeRecord(overrides: Partial<UnifiedRecord> = {}): UnifiedRecord {
  return {
    ids: { doi: '10.1/test' },
    title: 'Test Paper',
    authors: ['Author One'],
    sources: ['test'],
    ...overrides,
  }
}

function makeAdapter(name: string, records: UnifiedRecord[]): SourceAdapter {
  return {
    name,
    search: vi.fn().mockResolvedValue(records),
    fetch: vi.fn().mockResolvedValue(null),
    resolve: vi.fn().mockResolvedValue(null),
  }
}

function makeFailingAdapter(name: string): SourceAdapter {
  return {
    name,
    search: vi.fn().mockRejectedValue(new Error(`${name} unavailable`)),
    fetch: vi.fn().mockResolvedValue(null),
    resolve: vi.fn().mockResolvedValue(null),
  }
}

describe('SearchService', () => {
  it('fan-out queries all adapters and merges results', async () => {
    const a = makeAdapter('arxiv', [makeRecord({ ids: { doi: '10.1/a' }, title: 'Paper A', sources: ['arxiv'] })])
    const b = makeAdapter('s2', [makeRecord({ ids: { doi: '10.1/b' }, title: 'Paper B', sources: ['s2'] })])
    const svc = new SearchService([a, b])

    const result = await svc.search({ query: 'test' })
    expect(result.records).toHaveLength(2)
    expect(result.sourceResults).toHaveLength(2)
    expect(result.sourceResults.every((r) => r.status === 'ok')).toBe(true)
  })

  it('failing adapter produces error status but does not throw', async () => {
    const good = makeAdapter('arxiv', [makeRecord({ sources: ['arxiv'] })])
    const bad = makeFailingAdapter('pubmed')
    const svc = new SearchService([good, bad])

    const result = await svc.search({ query: 'test' })
    expect(result.records.length).toBeGreaterThan(0)
    const badResult = result.sourceResults.find((r) => r.source === 'pubmed')
    expect(badResult?.status).toBe('error')
    expect(badResult?.error).toContain('unavailable')
  })

  it('deduplicates records with same DOI from different sources', async () => {
    const rec1 = makeRecord({ ids: { doi: '10.1/shared' }, sources: ['arxiv'], title: 'Shared Paper' })
    const rec2 = makeRecord({ ids: { doi: '10.1/shared' }, sources: ['s2'], title: 'Shared Paper' })
    const a = makeAdapter('arxiv', [rec1])
    const b = makeAdapter('s2', [rec2])
    const svc = new SearchService([a, b])

    const result = await svc.search({ query: 'test' })
    expect(result.records).toHaveLength(1)
    expect(result.records[0]!.sources).toContain('arxiv')
    expect(result.records[0]!.sources).toContain('s2')
  })

  it('source filter only queries specified adapters', async () => {
    const a = makeAdapter('arxiv', [makeRecord({ sources: ['arxiv'] })])
    const b = makeAdapter('pubmed', [makeRecord({ ids: { pmid: '111' }, sources: ['pubmed'] })])
    const svc = new SearchService([a, b])

    await svc.search({ query: 'test', sources: ['arxiv'] })
    expect(a.search).toHaveBeenCalled()
    expect(b.search).not.toHaveBeenCalled()
  })

  it('cache hit returns cached records without querying adapters again', async () => {
    const a = makeAdapter('arxiv', [makeRecord({ sources: ['arxiv'] })])
    const cache = new MemoryCache()
    const svc = new SearchService([a], cache)

    await svc.search({ query: 'cached query' })
    await svc.search({ query: 'cached query' })

    expect(a.search).toHaveBeenCalledTimes(1)
  })

  it('pagination via offset slices the deduped results', async () => {
    const records = [
      makeRecord({ ids: { doi: '10.1/1' }, title: 'Paper 1', sources: ['test'] }),
      makeRecord({ ids: { doi: '10.1/2' }, title: 'Paper 2', sources: ['test'] }),
      makeRecord({ ids: { doi: '10.1/3' }, title: 'Paper 3', sources: ['test'] }),
    ]
    const a = makeAdapter('arxiv', records)
    const svc = new SearchService([a])

    const page1 = await svc.search({ query: 'test', limit: 2, offset: 0 })
    const page2 = await svc.search({ query: 'test', limit: 2, offset: 2 })
    expect(page1.records).toHaveLength(2)
    expect(page2.records).toHaveLength(1)
    expect(page1.total).toBe(3)
  })
})
