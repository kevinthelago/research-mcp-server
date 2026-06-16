/**
 * Generates docs/tools.md from the server's registered tool definitions.
 *
 * Usage: pnpm gen:tool-docs
 *
 * The script imports the tool registry from src/tools/index.ts, converts each
 * tool's Zod input schema to a parameter table, and writes the result to
 * docs/tools.md. Run this after adding or modifying tools.
 */

import { writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { zodToJsonSchema } from "zod-to-json-schema";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const OUT = resolve(ROOT, "docs", "tools.md");

// The tool registry is expected to export an array of tool definitions.
// Each definition has: name, description, inputSchema (Zod object).
const { tools } = await import("../src/tools/index.js");

type JsonSchemaObject = {
  type?: string;
  description?: string;
  properties?: Record<string, JsonSchemaObject>;
  items?: JsonSchemaObject;
  enum?: unknown[];
  required?: string[];
  anyOf?: JsonSchemaObject[];
};

function typeLabel(schema: JsonSchemaObject): string {
  if (schema.anyOf) {
    return schema.anyOf.map(typeLabel).join(" | ");
  }
  if (schema.enum) {
    return schema.enum.map((v) => `\`"${v}"\``).join(" \\| ");
  }
  if (schema.type === "array" && schema.items) {
    return `array<${typeLabel(schema.items)}>`;
  }
  return schema.type ?? "unknown";
}

function renderParamTable(jsonSchema: JsonSchemaObject): string {
  const props = jsonSchema.properties ?? {};
  const required = new Set(jsonSchema.required ?? []);

  if (Object.keys(props).length === 0) {
    return "_No input parameters._\n";
  }

  const rows = Object.entries(props).map(([name, prop]) => {
    const req = required.has(name) ? "Yes" : "No";
    const desc = prop.description ?? "—";
    return `| \`${name}\` | \`${typeLabel(prop)}\` | ${req} | ${desc} |`;
  });

  return [
    "| Parameter | Type | Required | Description |",
    "|---|---|---|---|",
    ...rows,
  ].join("\n") + "\n";
}

function renderTool(tool: {
  name: string;
  description: string;
  inputSchema: Parameters<typeof zodToJsonSchema>[0];
}): string {
  const jsonSchema = zodToJsonSchema(tool.inputSchema, {
    target: "jsonSchema7",
  }) as JsonSchemaObject;

  return [
    `## \`${tool.name}\``,
    "",
    tool.description,
    "",
    "**Input**",
    "",
    renderParamTable(jsonSchema),
  ].join("\n");
}

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
