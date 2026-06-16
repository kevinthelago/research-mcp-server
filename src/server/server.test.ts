import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { createServer, registerTool } from './index.js'
import type { ServerContext } from './index.js'
import type { AppConfig } from '../config/index.js'
import type { Logger } from '../logger.js'

const mockConfig: AppConfig = {
  dataDir: '/tmp/test',
  transport: 'stdio',
  port: 3000,
  embedder: 'local',
}

const mockLogger = {
  info: () => {},
  debug: () => {},
  warn: () => {},
  error: () => {},
} as unknown as Logger

const mockCtx: ServerContext = {
  config: mockConfig,
  logger: mockLogger,
  store: null,
  services: null,
}

describe('createServer', () => {
  it('returns an McpServer', () => {
    const server = createServer('test-server', '1.0.0')
    expect(server).toBeDefined()
  })
})

describe('registerTool', () => {
  it('registers a tool and returns the server for chaining', () => {
    const server = createServer('test-server', '1.0.0')

    const returned = registerTool(server, mockCtx, {
      name: 'echo',
      description: 'Echoes back the input text',
      inputSchema: { text: z.string() },
      handler: ({ text }) =>
        Promise.resolve({ content: [{ type: 'text' as const, text }] }),
    })

    expect(returned).toBe(server)
  })

  it('supports chaining multiple registerTool calls', () => {
    const server = createServer('test-server', '1.0.0')

    const result = registerTool(server, mockCtx, {
      name: 'tool-a',
      description: 'Tool A',
      inputSchema: { x: z.number() },
      handler: ({ x }) =>
        Promise.resolve({ content: [{ type: 'text' as const, text: String(x) }] }),
    })

    registerTool(result, mockCtx, {
      name: 'tool-b',
      description: 'Tool B',
      inputSchema: { y: z.boolean() },
      handler: ({ y }) =>
        Promise.resolve({ content: [{ type: 'text' as const, text: String(y) }] }),
    })

    expect(result).toBe(server)
  })
})
