import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { AppConfig } from '../config/index.js'
import type { Logger } from '../logger.js'

export { McpServer }

/**
 * Runtime context injected into every tool handler.
 * TStore and TServices are typed by the streams that own them;
 * server-core treats them as opaque until the other streams provide types.
 */
export interface ServerContext<TStore = unknown, TServices = unknown> {
  config: AppConfig
  logger: Logger
  store: TStore
  services: TServices
}

/**
 * Shape for registering an MCP tool.
 *
 * @param TShape - zod raw shape describing the tool's input parameters.
 *
 * inputSchema  — plain zod shape object (e.g. `{ query: z.string() }`),
 *                NOT a `z.object(...)` wrapper — matches the McpServer API.
 * outputSchema — optional zod schema; stored for documentation / validation
 *                by the caller but not enforced at runtime by this helper.
 * handler      — async function that receives parsed input + injected context
 *                and returns an MCP CallToolResult-compatible object.
 */
export interface ToolDef<
  TShape extends z.ZodRawShape = z.ZodRawShape,
  TStore = unknown,
  TServices = unknown,
> {
  name: string
  description: string
  inputSchema: TShape
  outputSchema?: z.ZodTypeAny
  handler: (
    input: z.infer<z.ZodObject<TShape>>,
    ctx: ServerContext<TStore, TServices>,
  ) => Promise<{ content: Array<{ type: 'text'; text: string }> }>
}

/**
 * Registers a single tool on the given McpServer and returns the server for
 * optional chaining.
 *
 * The cast at the SDK call site is intentional: the SDK's registerTool generic
 * cannot be inferred through our wrapper's TShape parameter (the ToolCallback
 * type involves complex conditional types over ZodRawShapeCompat), so we pin
 * the types ourselves and cast at the boundary. The runtime behaviour is correct.
 */
export function registerTool<
  TShape extends z.ZodRawShape,
  TStore = unknown,
  TServices = unknown,
>(
  server: McpServer,
  ctx: ServerContext<TStore, TServices>,
  def: ToolDef<TShape, TStore, TServices>,
): McpServer {
  const config: { description?: string; inputSchema?: TShape; outputSchema?: z.ZodTypeAny } = {
    description: def.description,
    inputSchema: def.inputSchema,
  }
  if (def.outputSchema !== undefined) config.outputSchema = def.outputSchema

  // The SDK's registerTool generic cannot be inferred through TShape here; the cast
  // is safe because we own the inputSchema type and control what we pass.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
  server.registerTool(def.name, config as any, async (input: any) =>
    def.handler(input as z.infer<z.ZodObject<TShape>>, ctx),
  )
  return server
}

/** Constructs the MCP server instance. */
export function createServer(name: string, version: string): McpServer {
  return new McpServer({ name, version })
}
