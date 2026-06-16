import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import type { McpServer } from '../server/index.js'
import type { Logger } from '../logger.js'

/**
 * Connects the MCP server to a stdio transport and awaits shutdown.
 * This is the default transport for local MCP clients (Claude Desktop, etc.).
 */
export async function startStdio(server: McpServer, logger: Logger): Promise<void> {
  const transport = new StdioServerTransport()
  logger.info('Starting MCP server on stdio transport')
  await server.connect(transport)
}
