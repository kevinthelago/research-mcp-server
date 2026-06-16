import express, { type Request, type Response, type NextFunction } from 'express'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import type { McpServer } from '../server/index.js'
import type { AppConfig } from '../config/index.js'
import type { Logger } from '../logger.js'

/** Max request body size for JSON and raw binary payloads. */
const BODY_LIMIT = '10mb'

function createBearerMiddleware(token: string) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    const auth = _req.headers['authorization']
    if (auth !== `Bearer ${token}`) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    next()
  }
}

/**
 * Mounts the MCP server on an Express app and starts listening.
 * The streamable HTTP transport is stateless (no session management).
 *
 * Endpoints:
 *   POST /mcp  — client → server messages
 *   GET  /mcp  — server-sent events stream
 *   DELETE /mcp — session teardown (no-op in stateless mode)
 */
export async function startHttp(
  server: McpServer,
  config: AppConfig,
  logger: Logger,
): Promise<void> {
  const app = express()

  app.use(express.json({ limit: BODY_LIMIT }))
  app.use(express.raw({ type: 'application/octet-stream', limit: BODY_LIMIT }))

  if (config.httpBearerToken) {
    app.use('/mcp', createBearerMiddleware(config.httpBearerToken))
  }

  // Stateless transport — omitting sessionIdGenerator disables session tracking.
  const transport = new StreamableHTTPServerTransport()

  // SDK types have a minor mismatch with exactOptionalPropertyTypes (onclose getter
  // returns `() => void | undefined` but Transport interface declares `onclose?: () => void`).
  // The class implements Transport correctly at runtime, so the cast is safe.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
  await server.connect(transport as any)

  // express 4 does not natively handle async handlers; catching and forwarding to next()
  // keeps unhandled rejections from crashing the process silently.
  app.all('/mcp', (req, res, next) => {
    transport.handleRequest(req, res, req.body as unknown).catch((err: unknown) => {
      logger.error({ err }, 'MCP HTTP handler error')
      next(err)
    })
  })

  await new Promise<void>((resolve) => {
    app.listen(config.port, () => {
      logger.info({ port: config.port }, 'MCP server listening on HTTP transport')
      resolve()
    })
  })
}
