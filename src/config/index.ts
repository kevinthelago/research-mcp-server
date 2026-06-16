import { z } from 'zod'
import { homedir } from 'node:os'
import { join } from 'node:path'

const DEFAULT_DATA_DIR = join(homedir(), '.research-mcp')

const AppConfigSchema = z.object({
  /** Root directory for all persisted data (SQLite + LanceDB). */
  dataDir: z.string().default(DEFAULT_DATA_DIR),

  /** Active transport. stdio is the default for local MCP clients. */
  transport: z.enum(['stdio', 'http']).default('stdio'),

  /** TCP port used by the HTTP transport. */
  port: z.coerce.number().int().min(1).max(65535).default(3000),

  /** Semantic Scholar API key for higher rate limits (optional). */
  semanticScholarApiKey: z.string().optional(),

  /** Voyage AI API key (required when embedder = 'voyage'). */
  voyageApiKey: z.string().optional(),

  /** OpenAI API key (required when embedder = 'openai'). */
  openAiApiKey: z.string().optional(),

  /** Bearer token required by HTTP clients. Omit to disable auth. */
  httpBearerToken: z.string().optional(),

  /** Which embedder backend to use. 'local' runs entirely offline. */
  embedder: z.enum(['local', 'voyage', 'openai']).default('local'),
})

export type AppConfig = z.infer<typeof AppConfigSchema>

/**
 * Builds a validated AppConfig from environment variables + optional overrides.
 * Throws with a descriptive message on the first validation failure (fail-fast).
 */
export function loadConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  const raw: Record<string, unknown> = {
    dataDir: process.env['DATA_DIR'],
    transport: process.env['TRANSPORT'],
    port: process.env['PORT'],
    semanticScholarApiKey: process.env['SEMANTIC_SCHOLAR_API_KEY'],
    voyageApiKey: process.env['VOYAGE_API_KEY'],
    openAiApiKey: process.env['OPENAI_API_KEY'],
    httpBearerToken: process.env['HTTP_BEARER_TOKEN'],
    embedder: process.env['EMBEDDER'],
  }

  // Overrides win over env vars; strip undefined so defaults still apply.
  for (const [k, v] of Object.entries(overrides)) {
    if (v !== undefined) raw[k] = v
  }

  const result = AppConfigSchema.safeParse(raw)
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n')
    throw new Error(`Invalid configuration:\n${issues}`)
  }
  return result.data
}
