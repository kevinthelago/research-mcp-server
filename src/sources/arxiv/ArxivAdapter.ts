import { XMLParser } from 'fast-xml-parser'
import PQueue from 'p-queue'
import type { UnifiedRecord } from '../../models/record.js'
import type { FetchParams, ResolveParams, SearchParams, SourceAdapter } from '../index.js'
import { fetchWithRetry } from '../utils/http.js'

const BASE_URL = 'https://export.arxiv.org/api/query'

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: (name) => ['entry', 'author'].includes(name),
})

interface ArxivAuthor {
  name: string
}

interface ArxivLink {
  '@_title'?: string
  '@_href'?: string
}

interface ArxivEntry {
  id: string
  title: string
  summary?: string
  author?: ArxivAuthor[]
  published?: string
  'arxiv:doi'?: string
  'arxiv:journal_ref'?: string
  link?: ArxivLink | ArxivLink[]
}

interface ArxivFeed {
  entry?: ArxivEntry[]
}

interface ParsedXml {
  feed?: ArxivFeed
}

function extractArxivId(idUrl: string): string {
  // http://arxiv.org/abs/2301.00001v2 → 2301.00001
  const match = /abs\/([^v]+)/.exec(idUrl)
  return match?.[1] ?? idUrl
}

function entryToRecord(entry: ArxivEntry): UnifiedRecord {
  const links = Array.isArray(entry.link) ? entry.link : entry.link ? [entry.link] : []
  const pdfLink = links.find((l) => l['@_title'] === 'pdf')

  const authors =
    entry.author?.map((a) => a.name).filter((n): n is string => Boolean(n)) ?? []

  return {
    ids: {
      arxivId: extractArxivId(entry.id),
      doi: entry['arxiv:doi'],
    },
    title: entry.title.replace(/\s+/g, ' ').trim(),
    authors,
    abstract: entry.summary?.trim(),
    venue: entry['arxiv:journal_ref'],
    year: entry.published ? parseInt(entry.published.slice(0, 4), 10) : undefined,
    url: `https://arxiv.org/abs/${extractArxivId(entry.id)}`,
    openAccessPdfUrl: pdfLink?.['@_href'],
    sources: ['arxiv'],
  }
}

export class ArxivAdapter implements SourceAdapter {
  readonly name = 'arxiv'
  private queue: PQueue

  constructor() {
    this.queue = new PQueue({ concurrency: 1, intervalCap: 3, interval: 1000 })
  }

  async search(params: SearchParams): Promise<UnifiedRecord[]> {
    const { query, limit = 10, offset = 0 } = params
    let searchQuery = `all:${encodeURIComponent(query)}`
    if (params.yearFrom ?? params.yearTo) {
      const from = params.yearFrom ?? 1900
      const to = params.yearTo ?? 2100
      searchQuery += `+AND+submittedDate:[${from}0101+TO+${to}1231]`
    }
    const url = `${BASE_URL}?search_query=${searchQuery}&start=${offset}&max_results=${limit}`

    return this.queue.add(async () => {
      const res = await fetchWithRetry(url)
      const text = await res.text()
      return this.parseEntries(text)
    }) as Promise<UnifiedRecord[]>
  }

  async fetch(params: FetchParams): Promise<UnifiedRecord | null> {
    if (params.arxivId) {
      const url = `${BASE_URL}?id_list=${encodeURIComponent(params.arxivId)}`
      return this.queue.add(async () => {
        const res = await fetchWithRetry(url)
        const text = await res.text()
        const entries = this.parseEntries(text)
        return entries[0] ?? null
      }) as Promise<UnifiedRecord | null>
    }
    if (params.doi) {
      const results = await this.search({ query: `doi:${params.doi}`, limit: 1 })
      return results[0] ?? null
    }
    return null
  }

  async resolve(params: ResolveParams): Promise<UnifiedRecord | null> {
    if (params.doi) {
      return this.fetch({ doi: params.doi })
    }
    if (params.title) {
      const results = await this.search({ query: params.title, limit: 1 })
      return results[0] ?? null
    }
    if (params.rawRef) {
      const results = await this.search({ query: params.rawRef, limit: 1 })
      return results[0] ?? null
    }
    return null
  }

  private parseEntries(xml: string): UnifiedRecord[] {
    const parsed = parser.parse(xml) as ParsedXml
    const entries = parsed.feed?.entry ?? []
    return entries.map(entryToRecord)
  }
}
