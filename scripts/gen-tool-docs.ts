/**
 * Generates docs/tools.md from the server's registered tool definitions.
 *
 * Usage: pnpm gen:tool-docs
 *
 * Imports the tool registry from src/tools/index.ts, introspects each tool's
 * Zod input schema, and writes the result to docs/tools.md.
 * Requires no extra dependencies beyond zod (already in dependencies).
 */

import { writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { z } from "zod";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const OUT = resolve(ROOT, "docs", "tools.md");

// Expected export from src/tools/index.ts:
// export const tools: Array<{ name: string; description: string; inputSchema: z.ZodTypeAny }>
const { tools } = await import("../src/tools/index.js");

// ---------------------------------------------------------------------------
// Zod schema introspection (no external deps)
// ---------------------------------------------------------------------------

function typeLabel(schema: z.ZodTypeAny): string {
  if (schema instanceof z.ZodString) return "string";
  if (schema instanceof z.ZodNumber) return "number";
  if (schema instanceof z.ZodBoolean) return "boolean";
  if (schema instanceof z.ZodLiteral) return `"${schema._def.value}"`;
  if (schema instanceof z.ZodEnum) {
    return (schema._def.values as string[]).map((v) => `"${v}"`).join(" \\| ");
  }
  if (schema instanceof z.ZodArray) {
    return `array<${typeLabel(schema._def.type)}>`;
  }
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) {
    return typeLabel(schema._def.innerType);
  }
  if (schema instanceof z.ZodDefault) {
    return typeLabel(schema._def.innerType);
  }
  if (schema instanceof z.ZodUnion) {
    return (schema._def.options as z.ZodTypeAny[]).map(typeLabel).join(" \\| ");
  }
  if (schema instanceof z.ZodObject) return "object";
  return "unknown";
}

function isRequired(schema: z.ZodTypeAny): boolean {
  return !(schema instanceof z.ZodOptional || schema instanceof z.ZodNullable || schema instanceof z.ZodDefault);
}

function getDescription(schema: z.ZodTypeAny): string {
  return schema._def.description ?? "—";
}

function renderObjectTable(schema: z.ZodObject<z.ZodRawShape>): string {
  const shape = schema.shape;
  if (Object.keys(shape).length === 0) return "_No input parameters._\n";

  const rows = Object.entries(shape).map(([name, field]) => {
    const req = isRequired(field) ? "Yes" : "No";
    const desc = getDescription(field);
    return `| \`${name}\` | \`${typeLabel(field)}\` | ${req} | ${desc} |`;
  });

  return [
    "| Parameter | Type | Required | Description |",
    "|---|---|---|---|",
    ...rows,
  ].join("\n") + "\n";
}

function renderInputSection(schema: z.ZodTypeAny): string {
  if (schema instanceof z.ZodObject) {
    return renderObjectTable(schema);
  }
  if (schema instanceof z.ZodUnion) {
    const options = schema._def.options as z.ZodTypeAny[];
    return options
      .filter((o): o is z.ZodObject<z.ZodRawShape> => o instanceof z.ZodObject)
      .map((o, i) => `**Variant ${i + 1}**\n\n${renderObjectTable(o)}`)
      .join("\n");
  }
  return "_Complex schema — refer to source._\n";
}

function renderTool(tool: { name: string; description: string; inputSchema: z.ZodTypeAny }): string {
  return [
    `## \`${tool.name}\``,
    "",
    tool.description,
    "",
    "**Input**",
    "",
    renderInputSection(tool.inputSchema),
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const header = [
  "# Tool Reference",
  "",
  "> This document is generated from the server's registered Zod schemas.",
  "> Run `pnpm gen:tool-docs` to regenerate after adding or modifying tools.",
  "",
  "---",
  "",
].join("\n");

const body = tools.map(renderTool).join("\n\n---\n\n");

writeFileSync(OUT, header + body + "\n");
console.log(`Wrote ${tools.length} tools to ${OUT}`);
