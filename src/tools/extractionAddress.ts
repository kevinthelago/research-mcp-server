import { z } from 'zod';
import { FigureSchema, ReferenceSchema, SectionSchema, TableSchema } from '../models/document.js';
import type { ExtractionService } from '../services/extraction/index.js';

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

export const GetSectionInputSchema = z.object({
  canonicalId: z.string().min(1).describe('Canonical paper id.'),
  sectionId: z
    .string()
    .min(1)
    .describe('Section id (e.g. "s1", "s2.3"). Use extract_paper to discover ids.'),
});
export type GetSectionInput = z.infer<typeof GetSectionInputSchema>;

export const GetElementInputSchema = z.object({
  canonicalId: z.string().min(1).describe('Canonical paper id.'),
  elementId: z
    .string()
    .min(1)
    .describe(
      'Element id — figure (e.g. "f1"), table (e.g. "t2"), or reference (e.g. "r5"). ' +
        'Use extract_paper to discover ids.',
    ),
});
export type GetElementInput = z.infer<typeof GetElementInputSchema>;

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type GetSectionResult =
  | { kind: 'section'; section: z.infer<typeof SectionSchema> }
  | { kind: 'notFound'; id: string; documentId: string; message: string }
  | { kind: 'notExtracted'; canonicalId: string; message: string };

export type GetElementResult =
  | { kind: 'figure'; element: z.infer<typeof FigureSchema> }
  | { kind: 'table'; element: z.infer<typeof TableSchema> }
  | { kind: 'reference'; element: z.infer<typeof ReferenceSchema> }
  | { kind: 'notFound'; id: string; documentId: string; message: string }
  | { kind: 'notExtracted'; canonicalId: string; message: string };

// ---------------------------------------------------------------------------
// Tool factory
// ---------------------------------------------------------------------------

export function createExtractionAddressTools(svc: ExtractionService) {
  /**
   * `get_section` — return a single section subtree (title, paragraphs, and all
   * nested subsections) from an already-extracted paper.
   *
   * Never returns the whole document. Returns notFound if the sectionId is
   * unknown; returns notExtracted if the paper hasn't been extracted yet.
   */
  async function getSection(input: GetSectionInput): Promise<GetSectionResult> {
    const doc = await svc.getCachedDocument(input.canonicalId);
    if (!doc) {
      return {
        kind: 'notExtracted',
        canonicalId: input.canonicalId,
        message: `Paper "${input.canonicalId}" has not been extracted. Call extract_paper first.`,
      };
    }

    const result = svc.getSection(doc, input.sectionId);
    if (!result.ok) {
      return {
        kind: 'notFound',
        id: result.error.id,
        documentId: result.error.documentId,
        message: result.error.message,
      };
    }

    return { kind: 'section', section: result.section };
  }

  /**
   * `get_element` — return a single figure, table, or reference by element id.
   *
   * Figures have id prefix "f", tables "t", references "r".
   * Returns notFound if the id is unknown; notExtracted if not yet extracted.
   */
  async function getElement(input: GetElementInput): Promise<GetElementResult> {
    const doc = await svc.getCachedDocument(input.canonicalId);
    if (!doc) {
      return {
        kind: 'notExtracted',
        canonicalId: input.canonicalId,
        message: `Paper "${input.canonicalId}" has not been extracted. Call extract_paper first.`,
      };
    }

    const result = svc.getElement(doc, input.elementId);
    if (!result.ok) {
      return {
        kind: 'notFound',
        id: result.error.id,
        documentId: result.error.documentId,
        message: result.error.message,
      };
    }

    const el = result.element;
    const id = input.elementId;
    if (id.startsWith('f')) {
      return { kind: 'figure', element: el as z.infer<typeof FigureSchema> };
    }
    if (id.startsWith('t')) {
      return { kind: 'table', element: el as z.infer<typeof TableSchema> };
    }
    return { kind: 'reference', element: el as z.infer<typeof ReferenceSchema> };
  }

  return { getSection, getElement };
}
