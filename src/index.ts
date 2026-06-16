// Server core public API — imported by all other streams
export { loadConfig } from './config/index.js'
export type { AppConfig } from './config/index.js'

export { createLogger } from './logger.js'
export type { Logger, LoggerOpts } from './logger.js'

export { createServer, registerTool } from './server/index.js'
export type { ServerContext, ToolDef } from './server/index.js'

export { startStdio } from './transports/stdio.js'
export { startHttp } from './transports/http.js'
