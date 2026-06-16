import { cac } from 'cac'
import { loadConfig } from './config/index.js'
import type { AppConfig } from './config/index.js'
import { createLogger } from './logger.js'
import { createServer } from './server/index.js'
import { startStdio } from './transports/stdio.js'
import { startHttp } from './transports/http.js'

const cli = cac('research-mcp')

cli
  .command('', 'Start the research MCP server')
  .option('--http', 'Use the streamable HTTP transport instead of stdio')
  .option('--port <port>', 'HTTP port (default: 3000)')
  .option('--log-level <level>', 'Log level: trace|debug|info|warn|error', { default: 'info' })
  .action(async (opts: { http?: boolean; port?: string; logLevel?: string }) => {
    const overrides: Partial<AppConfig> = {}
    if (opts.http === true) overrides.transport = 'http'
    if (opts.port !== undefined) overrides.port = Number(opts.port)
    const config = loadConfig(overrides)

    const logger = createLogger({ level: opts.logLevel ?? 'info' })

    const server = createServer('research-mcp-server', '0.1.0')

    // Context will be populated by the persistence + services streams at startup.
    const ctx = { config, logger, store: null as unknown, services: null as unknown }
    void ctx // tools registered by other streams before this point

    if (config.transport === 'http') {
      await startHttp(server, config, logger)
    } else {
      await startStdio(server, logger)
    }
  })

cli.help()
cli.version('0.1.0')
cli.parse()
