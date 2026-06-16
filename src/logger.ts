/**
 * Stub — owned by server-core (CORE-2).
 * This file will be replaced when server-core lands on develop.
 */
export interface Logger {
  debug(obj: unknown, msg?: string): void;
  info(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
  error(obj: unknown, msg?: string): void;
}
