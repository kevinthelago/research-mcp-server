# Architecture Decisions

## SRCH-1: SourceAdapter interface (search stream)

### Interface (src/sources/index.ts)

```typescript
interface SourceAdapter {
  readonly name: string
  search(params: SearchParams): Promise<UnifiedRecord[]>
  fetch(params: FetchParams): Promise<UnifiedRecord | null>
  resolve(params: ResolveParams): Promise<UnifiedRecord | null>
}

interface SearchParams { query: string; limit?: number; offset?: number; yearFrom?: number; yearTo?: number }
interface FetchParams  { doi?: string; arxivId?: string; pmid?: string; pmcid?: string; s2Id?: string }
interface ResolveParams { title?: string; authors?: string[]; year?: number; doi?: string; rawRef?: string }
```

### UnifiedRecord model (src/models/record.ts)

```typescript
interface UnifiedRecord {
  ids: { doi?: string; arxivId?: string; pmid?: string; pmcid?: string; s2Id?: string }
  title: string
  authors: string[]
  abstract?: string
  venue?: string
  year?: number
  url?: string
  sources: string[]       // which adapters contributed this record
  citationCount?: number
  openAccessPdfUrl?: string
}
```

### Dedupe key strategy (src/sources/utils/dedupe.ts)

Priority: `doi` > `arxivId` > `normalized(title)+year`

Normalization: lowercase, strip punctuation, collapse whitespace.

Merge rule: union `sources[]` and `ids.*`; prefer longer `abstract`; first non-null wins for other fields.

### Cross-stream usage

- **retrieval stream**: call `fetch()` on `ArxivAdapter`, `SemanticScholarAdapter`, `PubMedAdapter`, `CrossrefAdapter` to hydrate paper metadata.
- **citation stream**: call `CrossrefAdapter.resolve()` and `SemanticScholarAdapter.resolve()` to resolve reference strings to canonical IDs.

### Adapters (src/sources/*)

| Adapter | Rate limit | Auth |
|---|---|---|
| ArxivAdapter | 3 req/s | none |
| SemanticScholarAdapter | 1 req/s (10 with key) | `SEMANTIC_SCHOLAR_API_KEY` env |
| PubMedAdapter | 3 req/s (10 with key) | `tool` + `email` params |
| CrossrefAdapter | 1 req/s | polite pool User-Agent |

### SearchService (src/services/search/SearchService.ts)

- Fan-out via `Promise.allSettled` — a failing source never throws
- Dedupes + merges via `dedupeAndMerge`
- Caches full result set by query hash (TTL-aware MemoryCache, default 5 min)
- Pagination applied to cached results

### MCP tool (src/tools/search.ts)

Exports `searchToolDef` (structurally compatible with server-core `ToolDef`) for server-core to import and register. Expects `ctx.services.searchService: SearchService`.
