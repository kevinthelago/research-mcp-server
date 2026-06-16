import { z } from 'zod';
import {
  FigureSchema,
  ReferenceSchema,
  SectionSchema,
  TableSchema,
} from '../models/document.js';
import type { ToolDef, ToolContext } from '../server/registry.js';
import type { ExtractionService } from '../services/extraction/index.js';

// ---- get_section -------------------------------------------------------------

const GetSectionInputSchema = z.object({
  canonicalId: z.string().describe('Canonical paper id.'),
  sectionId: z.string().describe('Section id (e.g. "s1", "s2.3"). Use extract_paper to discover ids.'),
});

const GetSectionOutputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('section'), section: SectionSchema }),
  z.object({ kind: z.literal('notFound'), id: z.string(), documentId: z.string(), message: z.string() }),
  z.object({ kind: z.literal('notExtracted'), canonicalId: z.string(), message: z.string() }),
]);

export const getSectionTool: ToolDef<
  typeof GetSectionInputSchema,
  typeof GetSectionOutputSchema
> = {
  name: 'get_section',
  description:
    'Return a single section subtree (title, paragraphs, and all nested subsections) ' +
    'from an extracted paper. Never returns the whole document. ' +
    'Returns notFound if the sectionId is unknown. ' +
    'Returns notExtracted if the paper has not been extracted yet (call extract_paper first).',
  inputSchema: GetSectionInputSchema,
  outputSchema: GetSectionOutputSchema,
  handler: async (input, ctx: ToolContext) => {
    const svc = (ctx.services as { extraction?: ExtractionService }).extraction;
    if (!svc) throw new Error('extraction service not registered');

    const doc = await svc.getCachedDocument(input.canonicalId);
    if (!doc) {
      return {
        kind: 'notExtracted' as const,
        canonicalId: input.canonicalId,
        message: `Paper "${input.canonicalId}" has not been extracted. Call extract_paper first.`,
      };
    }

    const result = svc.getSection(doc, input.sectionId);
    if (!result.ok) {
      return {
        kind: 'notFound' as const,
        id: result.error.id,
        documentId: result.error.documentId,
        message: result.error.message,
      };
    }

    return { kind: 'section' as const, section: result.section };
  },
};

// ---- get_element -------------------------------------------------------------

const GetElementInputSchema = z.object({
  canonicalId: z.string().describe('Canonical paper id.'),
  elementId: z
    .string()
    .describe(
      'Element id — figure (e.g. "f1"), table (e.g. "t2"), or reference (e.g. "r5"). ' +
        'Use extract_paper to discover ids.',
    ),
});

const ElementUnionSchema = z.union([FigureSchema, TableSchema, ReferenceSchema]);

const GetElementOutputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('figure'), element: FigureSchema }),
  z.object({ kind: z.literal('table'), element: TableSchema }),
  z.object({ kind: z.literal('reference'), element: ReferenceSchema }),
  z.object({ kind: z.literal('notFound'), id: z.string(), documentId: z.string(), message: z.string() }),
  z.object({ kind: z.literal('notExtracted'), canonicalId: z.string(), message: z.string() }),
]);

void ElementUnionSchema; // referenced via inference

export const getElementTool: ToolDef<
  typeof GetElementInputSchema,
  typeof GetElementOutputSchema
> = {
  name: 'get_element',
  description:
    'Return a single figure, table, or reference from an extracted paper by its element id. ' +
    'Never returns the whole document. ' +
    'Figures have id prefix "f", tables "t", references "r". ' +
    'Returns notFound if the elementId is unknown. ' +
    'Returns notExtracted if the paper has not been extracted yet.',
  inputSchema: GetElementInputSchema,
  outputSchema: GetElementOutputSchema,
  handler: async (input, ctx: ToolContext) => {
    const svc = (ctx.services as { extraction?: ExtractionService }).extraction;
    if (!svc) throw new Error('extraction service not registered');

    const doc = await svc.getCachedDocument(input.canonicalId);
    if (!doc) {
      return {
        kind: 'notExtracted' as const,
        canonicalId: input.canonicalId,
        message: `Paper "${input.canonicalId}" has not been extracted. Call extract_paper first.`,
      };
    }

    const result = svc.getElement(doc, input.elementId);
    if (!result.ok) {
      return {
        kind: 'notFound' as const,
        id: result.error.id,
        documentId: result.error.documentId,
        message: result.error.message,
      };
    }

    const el = result.element;
    const id = input.elementId;
    if (id.startsWith('f')) return { kind: 'figure' as const, element: el as z.infer<typeof FigureSchema> };
    if (id.startsWith('t')) return { kind: 'table' as const, element: el as z.infer<typeof TableSchema> };
    return { kind: 'reference' as const, element: el as z.infer<typeof ReferenceSchema> };
  },
};
