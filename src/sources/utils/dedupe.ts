import type { UnifiedRecord } from '../../models/record.js'

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function recordKey(rec: UnifiedRecord): string {
  if (rec.ids.doi) return `doi:${rec.ids.doi.toLowerCase()}`
  if (rec.ids.arxivId) return `arxiv:${rec.ids.arxivId}`
  return `title:${normalizeTitle(rec.title)}:${rec.year ?? 'unknown'}`
}

function mergeTwo(a: UnifiedRecord, b: UnifiedRecord): UnifiedRecord {
  return {
    ids: {
      doi: a.ids.doi ?? b.ids.doi,
      arxivId: a.ids.arxivId ?? b.ids.arxivId,
      pmid: a.ids.pmid ?? b.ids.pmid,
      pmcid: a.ids.pmcid ?? b.ids.pmcid,
      s2Id: a.ids.s2Id ?? b.ids.s2Id,
    },
    title: a.title,
    authors: a.authors.length >= b.authors.length ? a.authors : b.authors,
    // prefer longer abstract
    abstract:
      (a.abstract?.length ?? 0) >= (b.abstract?.length ?? 0) ? a.abstract : b.abstract,
    venue: a.venue ?? b.venue,
    year: a.year ?? b.year,
    url: a.url ?? b.url,
    sources: [...new Set([...a.sources, ...b.sources])],
    citationCount: a.citationCount ?? b.citationCount,
    openAccessPdfUrl: a.openAccessPdfUrl ?? b.openAccessPdfUrl,
  }
}

export function dedupeAndMerge(records: UnifiedRecord[]): UnifiedRecord[] {
  const byKey = new Map<string, UnifiedRecord>()
  for (const rec of records) {
    const key = recordKey(rec)
    const existing = byKey.get(key)
    byKey.set(key, existing ? mergeTwo(existing, rec) : rec)
  }
  return [...byKey.values()]
}
