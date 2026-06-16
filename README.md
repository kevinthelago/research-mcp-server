# research-mcp-server

![License](https://img.shields.io/github/license/kevinthelago/research-mcp-server) ![Last commit](https://img.shields.io/github/last-commit/kevinthelago/research-mcp-server)

# Research MCP Server

## Overview

# Research MCP Server

## Tech stack

# Stack

## Runtime & language
- **Node.js 20 LTS+**, **TypeScript 5.x** (strict). ESM modules.
- **pnpm** as package manager; **tsup** (esbuild) for build, **tsx** for dev.

## MCP layer
- **`@modelcontextprotocol/sdk`** (official TypeScript SDK) — exposes tools over
  both **stdio** and **streamable HTTP** transports from one server core.
- **zod** for tool input/output schemas (the SDK is zod-native) and for validating
  normalized records.

## HTTP transport
- The SDK's **streamable HTTP** transport, mounted on **Express** (Node http) —
  serves the remote/programmatic audience. Optional bearer-token auth for the HTTP
  endpoint (see security).

## Source clients (search / retrieve)
- **arXiv** — Atom XML API over HTTP; parsed with **fast-xml-parser**.
- **Semantic Scholar** — Graph REST API (JSON); optional API key for higher limits.
- **PubMed / PMC** — NCBI **E-utilities** (esearch/efetch, XML); PMC OA full text.
- **Crossref** — REST (JSON) for DOI metadata + reference resolution.
- HTTP via native **undici/fetch**; per-source rate limiting with **p-queue** /
  token-bucket; retries with backoff.

## Structured extraction (core)
- **GROBID** — runs as a **Docker service** (Java); the Node server calls its
  `/api/processFulltextDocument` over HTTP and parses the returned **TEI XML**
  (fast-xml-parser) into our normalized structured-document model: metadata,
  section tree, references, figures/captions, tables.
- **PyMuPDF-free** fallback for basic text when GROBID is unavailable is **out of
  v1** — GROBID is required for the core. (Revisit if a Docker-free path is needed.)
- User-provided PDFs go through the **same GROBID pipeline**.

## Citation resolution
- Reference strings from GROBID's TEI are resolved to identifiers via
  **Crossref** + **Semantic Scholar** lookups (DOI / arXiv id), with a confidence
  score; unresolved refs are kept as parsed strings.

## RAG layer
- **Embeddings — pluggable `Embedder` interface**, configurable via env:
  - **Local default:** **Transformers.js** (`@xenova/transformers`, ONNX) running a
    small retrieval model (e.g. `bge-small-en-v1.5`) — offline, no key, no per-call
    cost.
  - **API option:** Voyage AI or OpenAI embeddings via their REST APIs (key in env).
- **Vector store — LanceDB** (`@lancedb/lancedb`): embedded, file-based, no separate
  server; stores chunk vectors + metadata for filtered retrieval. Backs the
  `semantic_search` tool.
- **Chunking** — section-aware splitting of extracted text (keeps section/figure
  provenance on each chunk for citation-grounded passages).

## Persistence & caching
- **SQLite** via **better-sqlite3** — cache of fetched metadata, raw payloads, and
  extraction results (keyed by canonical id) to respect upstream rate limits and
  avoid re-extraction. LanceDB holds vectors; SQLite holds everything else.
- All data lives under a configurable data dir (default `~/.research-mcp`).

## Tooling & quality
- **vitest** for unit + integration tests; **nock**/MSW-style HTTP mocking for
  source clients; a GROBID integration test gated behind a running container.
- **ESLint + Prettier**; **tsc --noEmit** typecheck in CI.
- **pino** for structured logging.
- Config via **env + a typed config loader** (zod-validated).

## Self-host shape
- `docker-compose` bundling the **GROBID** service + the MCP server (HTTP mode).
- For local stdio (Claude Desktop/Code): run the Node server directly; GROBID via a
  documented `docker run`. Example client configs shipped in docs.

## Getting started

```bash
git clone https://github.com/kevinthelago/research-mcp-server.git
cd research-mcp-server
# install dependencies and run the project's build/test/dev commands
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and our [Code of Conduct](CODE_OF_CONDUCT.md).

## License

See [LICENSE](LICENSE).

---

_Scaffolded by base-studio-code._