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

---

## Store Interface Shape (PERS-3)

The persistence layer implements the contracts defined in `src/contracts/persistence.ts`.

### Contract interfaces

```ts
// src/contracts/persistence.ts
interface PaperCache {
  get(canonicalId: string): Promise<RetrievedPaper | null>
  set(paper: RetrievedPaper): Promise<void>
}

interface BlobStore {
  /** Stores content addressed by sha256 hash; returns absolute path. */
  store(content: Buffer, sha256: string): Promise<string>
}
```

`RetrievedPaper` is defined in `src/models/retrievedPaper.ts`.

### Additional store interface (TTL cache)

```ts
interface CacheStore {
  get<T>(key: string): T | undefined
  set<T>(key: string, value: T, ttlMs?: number): void
  has(key: string): boolean
  delete(key: string): void
  /** Evicts all cache entries; does NOT touch PDFs or vector data. */
  clear(): void
}
```

### Facade

```ts
// src/store/index.ts
interface Store {
  cache:    CacheStore      // generic TTL key-value cache (API response cache, etc.)
  papers:   PaperCache      // contract-aligned: RetrievedPaper by canonicalId
  blobs:    BlobStore       // contract-aligned: content-addressed PDF storage
  getLanceDb(): Promise<LanceDbConnection>
  close(): void
}

import { createStore } from './src/store/index.js'
const store = createStore(dataDir)  // dataDir from config (CORE-2)
```

For unit tests without disk I/O, use `InMemoryStore` which implements the same `Store` interface.

## SQLite backend: node:sqlite instead of better-sqlite3 (PERS-1)

**Decision:** Use Node.js's built-in `node:sqlite` module (available since Node 22.5) rather
than `better-sqlite3`.

**Why:** `better-sqlite3` requires native compilation via node-gyp and has no prebuilt binary
for Node 24 (ABI 137). On this environment (Windows / Node 24.14.0) the build fails.
`node:sqlite` provides the same synchronous API, requires no native build, and is always
available on Node ≥22.5.

**Impact:** The project's `engines.node` field must be set to `>=22.5.0` (not just `>=20`).
The vitest config includes a Vite plugin that shims `node:sqlite` via `createRequire`
because Vite v5 does not recognise it as a Node built-in.

## PDF blobs: filesystem, not SQLite (PERS-2)

**Decision:** PDFs stored under `<dataDir>/pdfs/` as content-addressed files (filename = sha256),
not as BLOBs in SQLite. The `BlobStore.store()` method returns the absolute path.

**Why:** Large binary payloads in SQLite bloat the WAL file and slow down writes. Filesystem
access is more efficient for sequentially-read blobs. `cache-clear` (evict cache only) is
also simpler: delete the cache table rows, leave `pdfs/` alone.
