# Tool Reference

> This document is generated from the server's registered Zod schemas.
> Run `pnpm gen:tool-docs` to regenerate after adding or modifying tools.

---

## `search`

Search academic papers across arXiv, Semantic Scholar, PubMed, and Crossref. Returns normalized records with IDs, authors, abstract, venue, and open-access links.

**Input**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `query` | `string` | Yes | Search query for academic papers |
| `sources` | `array<"arxiv" \| "semantic-scholar" \| "pubmed" \| "crossref">` | No | Filter to specific sources. Default: all. |
| `limit` | `number` | No | Max results per source. Default: `10`, max: `100`. |
| `offset` | `number` | No | Pagination offset. Default: `0`. |
| `yearFrom` | `number` | No | Filter results published from this year (inclusive, 1900–2100). |
| `yearTo` | `number` | No | Filter results published up to this year (inclusive, 1900–2100). |

---

## `get_paper`

Resolve a paper identifier (DOI, arXiv ID, PMID, PMCID, or URL) to metadata and, when an open-access PDF is available, download and cache it. Returns `hasFullText=false` when no PDF is available — this is not an error. Throws `NOT_FOUND` when no source recognises the identifier.

**Input**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `id` | `string` | Yes | Paper identifier: DOI, arXiv ID (e.g. `2101.00001`), PMID, PMCID, or a DOI/PubMed/arXiv URL |

**Returns** `canonicalId`, `metadata` (title, authors, abstract, year, doi, arxivId, pubmedId, venue, citationCount), `pdfPath` (if available), `hasFullText`, `source`.

---

## `ingest_pdf`

Ingest a PDF through GROBID and add it to the library. Validates PDF magic bytes, enforces a 200 MB size cap, stores the content in the blob store, and mints a content-sha256 canonical ID (idempotent — the same bytes always yield the same ID). Returns `hasFullText=true`.

**Requires GROBID.** See [self-hosting docs](./self-hosting.md) to start GROBID.

**Input** — provide exactly one of `path` or `base64`:

| Parameter | Type | Required | Description |
|---|---|---|---|
| `path` | `string` | One of path/base64 | Absolute path to a PDF file on the local filesystem |
| `base64` | `string` | One of path/base64 | Base64-encoded PDF content (for passing binary data over the MCP protocol) |

**Returns** `canonicalId`, `metadata`, `pdfPath`, `hasFullText: true`, `source: "ingest"`.

---

## `extract_paper`

Run a retrieved paper through GROBID and return a structured document (metadata, section tree, references, figures, tables). Results are cached by canonical ID so repeated calls return instantly without re-extracting.

Returns `noPdf` if the paper has no stored PDF (call `ingest_pdf` first). Returns `grobidUnavailable` when the GROBID container is not running.

**Requires GROBID.** See [self-hosting docs](./self-hosting.md) to start GROBID.

**Input**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `canonicalId` | `string` | Yes | Canonical paper ID returned by `get_paper` or `ingest_pdf` |

**Returns** One of:
- `{ kind: "document", document }` — success; `document` has `metadata`, `sections`, `references`, `figures`, `tables`
- `{ kind: "noPdf", canonicalId, message }` — paper has no stored PDF
- `{ kind: "grobidUnavailable", message, hint }` — GROBID container not reachable

---

## `get_section`

Return a single section subtree (title, paragraphs, and all nested subsections) from an already-extracted paper. Never returns the whole document.

**Input**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `canonicalId` | `string` | Yes | Canonical paper ID |
| `sectionId` | `string` | Yes | Section ID (e.g. `"s1"`, `"s2.3"`). Use `extract_paper` to discover IDs. |

**Returns** One of:
- `{ kind: "section", section }` — success
- `{ kind: "notFound", id, documentId, message }` — unknown section ID
- `{ kind: "notExtracted", canonicalId, message }` — paper not yet extracted

---

## `get_element`

Return a single figure, table, or reference by element ID. Element ID prefixes: `f` = figure, `t` = table, `r` = reference (e.g. `"f1"`, `"t2"`, `"r5"`).

**Input**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `canonicalId` | `string` | Yes | Canonical paper ID |
| `elementId` | `string` | Yes | Element ID. Use `extract_paper` to discover IDs. |

**Returns** One of:
- `{ kind: "figure", element }` — figure with caption
- `{ kind: "table", element }` — table with caption
- `{ kind: "reference", element }` — reference with resolvedId and confidence
- `{ kind: "notFound", id, documentId, message }` — unknown element ID
- `{ kind: "notExtracted", canonicalId, message }` — paper not yet extracted

---

## `resolve_citations`

Resolve the extracted references of a stored document to canonical identifiers (DOI, arXiv ID) with confidence scores. Writes `resolvedId` and `confidence` back onto the document so `get_element` reflects them.

**Input**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `documentId` | `string` | Yes | ID of the stored document whose references should be resolved |
| `forceRefresh` | `boolean` | No | Re-resolve references even if cached results exist |

**Returns** `{ documentId, summary: { total, alreadyResolved, cacheHits, resolved, unresolved, errors }, resolutions: [{ raw, resolvedId, confidence, status }] }`.

---

## `index_paper`

Chunk a paper's extracted text, embed each chunk, and upsert into the LanceDB vector store for semantic search. Pass the structured document returned by `extract_paper`.

**Input**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `paperId` | `string` | Yes | Canonical paper identifier (must match `document.paperId`) |
| `document` | `object` | Yes | The structured document returned by `extract_paper` |

**Returns** `{ paperId, chunksIndexed, message }`.

---

## `semantic_search`

Vector-similarity search over all indexed papers. Returns ranked chunks with their paper ID and section provenance, enabling citation-grounded passage retrieval.

**Input**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `query` | `string` | Yes | Natural-language search query |
| `topK` | `number` | No | Maximum results to return. Default: `10`, max: `100`. |
| `scope` | `object` | No | Optional filter. `scope.paperIds` restricts search to specific paper IDs. |

**Returns** `{ results: [{ paperId, sectionId, text, score }], note? }`.
