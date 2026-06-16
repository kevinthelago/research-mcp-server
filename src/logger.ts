import pino from 'pino'

/** Fields that must never appear in logs in cleartext. */
const REDACTED_PATHS = [
  'apiKey',
  'api_key',
  'bearerToken',
  'bearer_token',
  'httpBearerToken',
  'openAiApiKey',
  'voyageApiKey',
  'semanticScholarApiKey',
  'password',
  'token',
  'secret',
  'authorization',
]

export interface LoggerOpts {
  level?: string
  /** Force pretty-printing (pino-pretty). Off by default in production. */
  pretty?: boolean
}

export type Logger = pino.Logger

/**
 * Creates a structured pino logger that always writes to stderr.
 * Writing to stderr keeps stdout free for the MCP stdio transport.
 * Sensitive fields are redacted automatically.
 */
export function createLogger(opts: LoggerOpts = {}): Logger {
  const level = opts.level ?? process.env['LOG_LEVEL'] ?? 'info'
  const pretty = opts.pretty ?? process.env['NODE_ENV'] === 'development'

  const baseOpts: pino.LoggerOptions = {
    level,
    redact: {
      paths: REDACTED_PATHS,
      censor: '[REDACTED]',
    },
  }

  if (pretty) {
    return pino({
      ...baseOpts,
      transport: {
        target: 'pino-pretty',
        options: { colorize: true, destination: 2 },
      },
    })
  }

  return pino(baseOpts, pino.destination(2))
}
