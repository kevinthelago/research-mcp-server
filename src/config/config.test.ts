import { describe, it, expect, afterEach, vi } from 'vitest'
import { loadConfig } from './index.js'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('loadConfig', () => {
  it('returns defaults when no env vars are set', () => {
    const cfg = loadConfig()
    expect(cfg.transport).toBe('stdio')
    expect(cfg.port).toBe(3000)
    expect(cfg.embedder).toBe('local')
    expect(cfg.httpBearerToken).toBeUndefined()
  })

  it('reads transport from TRANSPORT env var', () => {
    vi.stubEnv('TRANSPORT', 'http')
    expect(loadConfig().transport).toBe('http')
  })

  it('coerces PORT string to number', () => {
    vi.stubEnv('PORT', '8080')
    expect(loadConfig().port).toBe(8080)
  })

  it('applies overrides over env vars', () => {
    vi.stubEnv('PORT', '9000')
    expect(loadConfig({ port: 4000 }).port).toBe(4000)
  })

  it('throws with a descriptive message on invalid config', () => {
    vi.stubEnv('PORT', 'not-a-number')
    expect(() => loadConfig()).toThrow('Invalid configuration')
  })

  it('throws on out-of-range port', () => {
    vi.stubEnv('PORT', '99999')
    expect(() => loadConfig()).toThrow('Invalid configuration')
  })

  it('captures optional API keys from env', () => {
    vi.stubEnv('SEMANTIC_SCHOLAR_API_KEY', 'ss-key')
    vi.stubEnv('HTTP_BEARER_TOKEN', 'tok')
    const cfg = loadConfig()
    expect(cfg.semanticScholarApiKey).toBe('ss-key')
    expect(cfg.httpBearerToken).toBe('tok')
  })
})
