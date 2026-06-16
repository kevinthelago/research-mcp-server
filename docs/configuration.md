# Configuration

All configuration is via environment variables. No config file is required — set variables in your shell, a `.env` file (loaded by the server at startup), or Docker Compose's `environment` block.

## Core

| Variable | Default | Required | Description |
|---|---|---|---|
| `MCP_TRANSPORT` | `http` | No | Transport mode: `http` (streamable HTTP) or `stdio`. Use `stdio` for Claude Desktop / Claude Code. |
| `PORT` | `3000` | No | HTTP port the server listens on. Only used when `MCP_TRANSPORT=http`. |
| `DATA_DIR` | `~/.research-mcp` | No | Directory for the SQLite metadata cache and LanceDB vector store. Must be writable. In Docker, mount a volume here. |
| `LOG_LEVEL` | `info` | No | Pino log level: `fatal`, `error`, `warn`, `info`, `debug`, `trace`. |

## GROBID

| Variable | Default | Required | Description |
|---|---|---|---|
| `GROBID_URL` | `http://localhost:8070` | No | Base URL of the GROBID service. In Docker Compose this is `http://grobid:8070`. Required for `extract_paper` and `ingest_pdf` to work. |

## HTTP Security

| Variable | Default | Required | Description |
|---|---|---|---|
| `BEARER_TOKEN` | — | No | If set, the HTTP endpoint requires `Authorization: Bearer <token>` on every request. Leave unset to disable auth (suitable for local/trusted networks only). |

## Source API Keys

These are optional. Without keys the server uses public rate limits, which may be significantly lower.

| Variable | Default | Required | Description |
|---|---|---|---|
| `SEMANTIC_SCHOLAR_API_KEY` | — | No | Semantic Scholar Graph API key. Raises the rate limit from ~100 req/5 min to ~1 req/s. [Request one here.](https://www.semanticscholar.org/product/api) |
| `PUBMED_API_KEY` | — | No | NCBI E-utilities API key. Raises the rate limit from 3 req/s to 10 req/s. [Register here.](https://www.ncbi.nlm.nih.gov/account/) |

## Embeddings

| Variable | Default | Required | Description |
|---|---|---|---|
| `EMBEDDER` | `local` | No | Embedding backend: `local` (Transformers.js / ONNX, offline), `voyage`, or `openai`. |
| `EMBEDDING_MODEL` | *(backend default)* | No | Override the model name. Default for `local` is `Xenova/bge-small-en-v1.5`; for `voyage` is `voyage-3-lite`; for `openai` is `text-embedding-3-small`. |
| `VOYAGE_API_KEY` | — | Yes (if `EMBEDDER=voyage`) | Voyage AI API key. |
| `OPENAI_API_KEY` | — | Yes (if `EMBEDDER=openai`) | OpenAI API key. |

## Example `.env`

```dotenv
# Core
MCP_TRANSPORT=http
PORT=3000
DATA_DIR=/data
LOG_LEVEL=info

# GROBID (Docker Compose sets this automatically)
GROBID_URL=http://grobid:8070

# HTTP auth (disable for local-only deployments)
# BEARER_TOKEN=change-me

# Source API keys
SEMANTIC_SCHOLAR_API_KEY=your-key-here
PUBMED_API_KEY=your-key-here

# Embeddings
EMBEDDER=local
# EMBEDDER=voyage
# VOYAGE_API_KEY=your-key-here
```
