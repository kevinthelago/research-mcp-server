# Tool Reference

> This document is generated from the server's registered Zod schemas.
> Run `pnpm gen:tool-docs` to regenerate after adding or modifying tools.

---

## `search`

Search across academic databases (arXiv, Semantic Scholar, PubMed).

**Input**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `query` | `string` | Yes | Search query (natural language or Boolean) |
| `sources` | `array<"arxiv" \| "semantic_scholar" \| "pubmed">` | No | Data sources to query. Default: all sources. |
| `limit` | `number` | No | Max results per source. Default: `10`, max: `50`. |
| `year_from` | `number` | No | Filter results published from this year (inclusive). |
| `year_to` | `number` | No | Filter results published up to this year (inclusive). |

**Returns** An array of paper metadata records, each with `id`, `title`, `authors`, `abstract`, `year`, `source`, and `url` fields.

---

## `get_paper`

Fetch and cache full metadata for a single paper by identifier.

**Input**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `id` | `string` | Yes | Paper identifier — DOI (e.g. `10.1145/12345`), arXiv ID (e.g. `2301.00001`), or PubMed ID. |

**Returns** `canonicalId`, `metadata` (title, authors, abstract, year, doi, arxivId, pubmedId, venue, citationCount), `pdfPath` (if available), `hasFullText`, `source`.

---

## `ingest_pdf`

Ingest a PDF through GROBID and add it to the library. Provide either a local file path or base64-encoded PDF bytes — exactly one is required.

**Requires GROBID.** See [self-hosting docs](./self-hosting.md) to start GROBID.

**Input** (mutually exclusive variants)

| Parameter | Type | Required | Description |
|---|---|---|---|
| `path` | `string` | One of path/base64 | Absolute path to a PDF file on the local filesystem. |
| `base64` | `string` | One of path/base64 | Base64-encoded PDF content (for passing binary data over the MCP protocol). |

**Returns** `canonicalId` (sha256-based), `metadata` (title, authors, year, etc.), `pdfPath`, `hasFullText`, `source`.

---

## `extract_paper`

Extract structured content from an already-fetched or ingested paper.

**Requires GROBID.** Runs the full TEI XML extraction pipeline on the paper's PDF.

**Input**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `paper_id` | `string` | Yes | Paper ID (from `get_paper` or `ingest_pdf`). |
| `force` | `boolean` | No | Re-extract even if a cached result exists. Default: `false`. |

**Returns** Structured document: `metadata`, `sections` (tree of section titles + text), `references`, `figures`, `tables`.

---

## `get_section`

Retrieve a specific section from an extracted paper.

**Input**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `paper_id` | `string` | Yes | Paper ID. |
| `section` | `string` | Yes | Section title or path (e.g. `"Introduction"`, `"Methods.Data collection"`). Case-insensitive prefix match. |

**Returns** Section object: `title`, `text`, `subsections`.

---

## `get_element`

Retrieve a specific figure, table, or caption from an extracted paper.

**Input**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `paper_id` | `string` | Yes | Paper ID. |
| `type` | `"figure" \| "table"` | Yes | Element type. |
| `index` | `number` | Yes | 1-based index within the document. |

**Returns** Element object: `type`, `caption`, `content` (table rows as text, or figure description).

---

## `resolve_citations`

Resolve a paper's reference list to canonical identifiers (DOI / arXiv ID) via Crossref and Semantic Scholar.

**Input**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `paper_id` | `string` | Yes | Paper ID whose references to resolve. |

**Returns** Array of resolved references: `raw_string`, `doi`, `arxiv_id`, `title`, `authors`, `year`, `confidence` (0–1).

---

## `index_paper`

Chunk a paper's extracted text and embed it for semantic search.

**Input**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `paper_id` | `string` | Yes | Paper ID to index. Must have been extracted first (via `extract_paper` or `ingest_pdf`). |
| `force` | `boolean` | No | Re-index even if already indexed. Default: `false`. |

**Returns** Indexing summary: `paper_id`, `chunk_count`, `embedding_model`.

---

## `semantic_search`

Vector search over the ingested and indexed library.

**Input**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `query` | `string` | Yes | Natural-language query. |
| `limit` | `number` | No | Number of results to return. Default: `10`, max: `50`. |
| `paper_ids` | `array<string>` | No | Restrict search to these papers. Default: all indexed papers. |
| `section` | `string` | No | Restrict to chunks from a specific section title (prefix match). |

**Returns** Array of matching chunks: `paper_id`, `section`, `text`, `score` (cosine similarity, 0–1).
