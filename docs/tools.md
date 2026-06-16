# Tool Reference

> This document is generated from the server's registered Zod schemas.
> Run `pnpm gen:tool-docs` to regenerate after adding or modifying tools.

---
## `get_paper`

Resolve a paper identifier (DOI, arXiv ID, PMID, PMCID, or URL) to metadata and, when an open-access PDF is available, download and cache it. Returns hasFullText=false when no PDF is available — this is not an error. Throws NOT_FOUND when no source recognises the identifier.

**Input**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `id` | `string` | Yes | Paper identifier: DOI, arXiv ID (e.g. 2101.00001), PMID, PMCID, or a DOI/PubMed/arXiv URL |


---

## `ingest_pdf`

Ingest a PDF by filesystem path or base64-encoded bytes. Validates PDF magic bytes, enforces a 200 MB size cap, stores the content in the blob store, and mints a content-sha256 canonical ID (idempotent — the same bytes always yield the same ID). Returns hasFullText=true.

**Input**

_Complex schema — refer to source._


---

## `search`

(stub — search stream not yet landed) Search academic databases.

**Input**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `query` | `string` | Yes | Search query |
| `sources` | `array<"arxiv" \| "semantic_scholar" \| "pubmed">` | No | Data sources to query. Default: all. |
| `limit` | `number` | No | Max results per source. Default: 10. |
| `year_from` | `number` | No | Filter from this year (inclusive). |
| `year_to` | `number` | No | Filter to this year (inclusive). |


---

## `extract_paper`

(stub — extraction stream not yet landed) Extract structured content via GROBID.

**Input**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `paper_id` | `string` | Yes | Paper ID from get_paper or ingest_pdf. |
| `force` | `boolean` | No | Re-extract even if cached. Default: false. |


---

## `semantic_search`

(stub — rag stream not yet landed) Vector-similarity search over ingested papers.

**Input**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `query` | `string` | Yes | Natural-language search query. |
| `limit` | `number` | No | Max results. Default: 10. |
| `paper_ids` | `array<string>` | No | Restrict search to these paper IDs. |

