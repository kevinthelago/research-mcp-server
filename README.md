# Research MCP Server

![License](https://img.shields.io/github/license/kevinthelago/research-mcp-server) ![Last commit](https://img.shields.io/github/last-commit/kevinthelago/research-mcp-server)

An MCP server that gives Claude (and other MCP clients) access to academic research: search arXiv / Semantic Scholar / PubMed, fetch and cache papers, extract structured content via GROBID, resolve citations, and run semantic search over an ingested library.

## Quick start

Choose the path that matches how you want to use the server.

---

### Path A — Local stdio (Claude Desktop / Claude Code)

Use this when you want Claude Desktop or Claude Code to invoke the server directly as a subprocess. GROBID runs as a separate Docker container.

**Prerequisites:** Node.js 20+, pnpm, Docker

```bash
# 1. Clone and install
git clone https://github.com/kevinthelago/research-mcp-server.git
cd research-mcp-server
pnpm install
pnpm build

# 2. Start GROBID (needed for extract_paper / ingest_pdf)
docker run -d --name grobid -p 8070:8070 lfoppiano/grobid:0.8.1

# 3. Configure your MCP client (see examples/ directory)
#    For Claude Desktop: edit ~/Library/Application Support/Claude/claude_desktop_config.json
#    For Claude Code:    create .mcp.json in your project root
```

Copy the relevant example config from [`examples/`](./examples/) and update the path to your local `dist/index.js`.

On first run, Transformers.js downloads the embedding model (~130 MB) into `DATA_DIR`. This happens once and is cached automatically — see [self-hosting docs](./docs/self-hosting.md#first-run-notes) for details.

---

### Path B — HTTP mode via Docker Compose

Use this for programmatic access, remote clients, or when you want everything containerised. The compose file bundles GROBID and the server together.

**Prerequisites:** Docker with Compose v2

```bash
# 1. Clone
git clone https://github.com/kevinthelago/research-mcp-server.git
cd research-mcp-server

# 2. (Optional) copy and edit the env file
cp .env.example .env   # set API keys, BEARER_TOKEN, etc.

# 3. Build + start
docker compose up -d

# 4. Verify the server is up
curl http://localhost:3000/health

# 5. Run a tools/list smoke test
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

The server waits for GROBID's healthcheck to pass before accepting requests. GROBID can take 60–90 seconds to load its models on first start.

Connect an MCP client to `http://localhost:3000/mcp`. See [`examples/mcp.json`](./examples/mcp.json) for a ready-made config.

---

## Tools

See [`docs/tools.md`](./docs/tools.md) for the full tool reference.

| Tool | Description |
|---|---|
| `search` | Search arXiv, Semantic Scholar, and PubMed |
| `get_paper` | Fetch and cache paper metadata by DOI / arXiv ID |
| `ingest_pdf` | Ingest a local PDF through GROBID into the library |
| `extract_paper` | Extract structured content (sections, references, figures) from a paper |
| `get_section` | Retrieve a specific section of an extracted paper |
| `get_element` | Retrieve a specific figure, table, or caption |
| `resolve_citations` | Resolve a paper's references to canonical identifiers |
| `index_paper` | Chunk and embed a paper for semantic search |
| `semantic_search` | Vector search over the ingested library |

## Configuration

All configuration is via environment variables. See [`docs/configuration.md`](./docs/configuration.md) for the full reference.

## Self-hosting

See [`docs/self-hosting.md`](./docs/self-hosting.md) for detailed deployment guidance, first-run notes, and architecture-specific considerations (Apple Silicon / ARM).

## Tech stack

- **Node.js 20 LTS**, **TypeScript 5.x**, ESM, **pnpm**, **tsup**
- **@modelcontextprotocol/sdk** — stdio + streamable HTTP transports
- **GROBID** — PDF structured extraction (Docker service)
- **Transformers.js** (local embeddings) or Voyage AI / OpenAI
- **LanceDB** (vector store) + **SQLite** (cache) — both embedded, no extra server
- Sources: arXiv, Semantic Scholar, PubMed/PMC, Crossref

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and our [Code of Conduct](CODE_OF_CONDUCT.md).

## License

See [LICENSE](LICENSE).
