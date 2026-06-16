# Self-Hosting Guide

## Prerequisites

| Path | Requirements |
|---|---|
| Local stdio | Node.js 20+, pnpm, Docker (for GROBID) |
| HTTP via Compose | Docker with Compose v2 |

## Path A — Local stdio (Claude Desktop / Claude Code)

This runs the server as a child process of your MCP client. GROBID runs separately.

### 1. Build the server

```bash
git clone https://github.com/kevinthelago/research-mcp-server.git
cd research-mcp-server
pnpm install
pnpm build
```

### 2. Start GROBID

```bash
docker run -d \
  --name grobid \
  --restart unless-stopped \
  -p 8070:8070 \
  lfoppiano/grobid:0.8.1
```

GROBID loads its models on startup. This takes 30–90 seconds. You can check readiness with:

```bash
curl http://localhost:8070/api/isalive
# returns 200 when ready
```

### 3. Configure your MCP client

**Claude Desktop** — edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "research": {
      "command": "node",
      "args": ["/absolute/path/to/research-mcp-server/dist/index.js"],
      "env": {
        "MCP_TRANSPORT": "stdio",
        "DATA_DIR": "/Users/you/.research-mcp",
        "GROBID_URL": "http://localhost:8070"
      }
    }
  }
}
```

**Claude Code** — create `.mcp.json` in your project root (see [`examples/mcp.json`](../examples/mcp.json) for the HTTP variant).

---

## Path B — HTTP mode via Docker Compose

Everything — GROBID and the MCP server — runs in containers.

### 1. Clone and configure

```bash
git clone https://github.com/kevinthelago/research-mcp-server.git
cd research-mcp-server
cp .env.example .env
# Edit .env — set BEARER_TOKEN, API keys, etc.
```

### 2. Start the stack

```bash
docker compose up -d
```

The server waits for GROBID's `/api/isalive` healthcheck before starting. On first boot GROBID can take 60–90 seconds.

### 3. Verify

```bash
# Server health
curl http://localhost:3000/health

# MCP tools list
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

### 4. Connect your client

Point your MCP client to `http://localhost:3000/mcp`. See [`examples/mcp.json`](../examples/mcp.json).

---

## First-run notes

### Transformers.js model download

When `EMBEDDER=local` (the default), the server downloads the embedding model on first use of `index_paper` or `semantic_search`. The default model is `Xenova/bge-small-en-v1.5` (~130 MB). It is cached in `DATA_DIR/models` and only downloaded once.

If you are in an air-gapped environment, pre-download the model and set `EMBEDDING_MODEL` to a local path, or switch to an API-based embedder (`EMBEDDER=voyage` or `EMBEDDER=openai`).

### GROBID architecture (x86 vs ARM)

GROBID's official Docker image (`lfoppiano/grobid`) is built for **x86_64 (amd64)** only. On **Apple Silicon (M1/M2/M3/M4)** Docker Desktop runs it via Rosetta 2 emulation, which is functional but noticeably slower for large PDFs. This is a GROBID upstream limitation.

Workarounds for ARM:
- Use Rosetta 2 emulation (works, ~2–3× slower)
- Use a remote GROBID instance running on x86 hardware (set `GROBID_URL` accordingly)

### Data directory permissions

The `DATA_DIR` (default `/data` in Docker, `~/.research-mcp` locally) must be writable by the server process. In Docker Compose a named volume is created automatically. When bind-mounting a host directory, ensure the UID matches.

---

## Updating

```bash
git pull
docker compose build --no-cache
docker compose up -d
```

Data in the named volume persists across rebuilds.

## Stopping

```bash
docker compose down
# To also remove persisted data:
docker compose down -v
```
