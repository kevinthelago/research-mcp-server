/**
 * Stub — owned by server-core (CORE-3).
 * This file will be replaced when server-core lands on develop.
 * Extraction tools import from here; keep the signatures in sync with contracts/registerTool.md.
 */
import type { z, ZodSchema } from 'zod';
import type { Store } from '../store/index.js';
import type { Logger } from '../logger.js';

export interface Services {
  extraction?: import('../services/extraction/index.js').ExtractionService;
}

export interface ToolContext {
  config: Record<string, unknown>;
  logger: Logger;
  store: Store;
  services: Services;
}

export interface ToolDef<TInput extends ZodSchema, TOutput extends ZodSchema> {
  name: string;
  description: string;
  inputSchema: TInput;
  outputSchema: TOutput;
  handler: (input: z.infer<TInput>, ctx: ToolContext) => Promise<z.infer<TOutput>>;
}
