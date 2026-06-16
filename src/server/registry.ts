/**
 * Stub — owned by server-core (CORE-3).
 * This file will be replaced when server-core lands on develop.
 * Keep signatures in sync with contracts/registerTool.md.
 */
import type { z, ZodSchema } from 'zod';

export interface ToolDef<TInput extends ZodSchema, TOutput extends ZodSchema> {
  name: string;
  description: string;
  inputSchema: TInput;
  outputSchema: TOutput;
  handler: (input: z.infer<TInput>) => Promise<z.infer<TOutput>>;
}
