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

---

## EXTR-1: StructuredDocument model shape (src/models/document.ts)

**Date:** 2026-06-16  
**Stream:** extraction  
**Consumed by:** citation, rag

### Model shape

```ts
interface StructuredDocument {
  canonicalId: string;
  metadata: DocumentMetadata;        // title, authors, abstract, doi, arxivId, pmid, pmcid, year, journal, volume, issue, pages, keywords
  sections: Section[];               // nested tree (see below)
  references: Reference[];
  figures: Figure[];
  tables: Table[];
  fullTextAvailable: boolean;
  extractionQuality: 'full' | 'partial' | 'metadata-only';
}

interface Section {
  id: string;       // stable hierarchical id (see ID scheme)
  title?: string;
  level: number;    // 1=top-level, 2=subsection, etc.
  paragraphs: string[];
  children: Section[];
}

interface Reference {
  id: string;           // e.g. "r1"
  rawText: string;
  resolvedId?: string;  // set by the citation stream after resolution
  confidence?: number;  // 0–1, set by the citation stream
}

interface Figure {
  id: string;       // e.g. "f1"
  label?: string;   // e.g. "Figure 1"
  caption?: string;
}

interface Table {
  id: string;       // e.g. "t1"
  label?: string;
  caption?: string;
  content?: string; // tab-separated rows from TEI table element
}
```

### Stable ID scheme

All IDs are document-scoped (not globally unique) and deterministic for the same PDF through the same GROBID version:

| Element | Format | Examples |
|---------|--------|---------|
| Top-level section | `s{n}` | `s1`, `s2`, `s3` |
| Nested section | `s{parent}.{n}` | `s1.2`, `s1.2.3` |
| Reference | `r{n}` | `r1`, `r23` |
| Figure | `f{n}` | `f1`, `f2` |
| Table | `t{n}` | `t1`, `t2` |

IDs are assigned positionally in document order. Section hierarchy follows the GROBID TEI `<div>` nesting.

### Typed errors

Three typed error kinds are exported from the model:
- `NoPdfError` — paper has no stored PDF
- `ElementNotFoundError` — requested element id not found
- `GrobidUnavailableError` — GROBID container unreachable (includes docker hint)

### extractionQuality heuristic

Inferred from the parsed TEI:
- `'full'` — ≥3 paragraphs across sections
- `'partial'` — some sections/references but < 3 paragraphs (sparse/scanned PDF)
- `'metadata-only'` — no sections and no references parsed
