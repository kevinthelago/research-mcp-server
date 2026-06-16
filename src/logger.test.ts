import { describe, it, expect } from 'vitest'
import { createLogger } from './logger.js'

describe('createLogger', () => {
  it('creates a pino logger instance', () => {
    const logger = createLogger({ level: 'silent' })
    expect(typeof logger.info).toBe('function')
    expect(typeof logger.error).toBe('function')
    expect(logger.level).toBe('silent')
  })

  it('accepts a custom log level', () => {
    const logger = createLogger({ level: 'debug' })
    expect(logger.level).toBe('debug')
  })
})
