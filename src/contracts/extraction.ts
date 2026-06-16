/**
 * Stub contract for the extraction stream's StructuredDocument type.
 * Replace with the real import once the extraction stream lands on develop.
 */
import { z } from 'zod';

const documentSectionSchema = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string(),
  level: z.number().int().optional(),
  subsections: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        content: z.string(),
        level: z.number().int().optional(),
      }),
    )
    .optional(),
});

export const structuredDocumentSchema = z.object({
  paperId: z.string(),
  metadata: z.object({
    title: z.string(),
    authors: z.array(z.string()),
    abstract: z.string().optional(),
    year: z.number().int().optional(),
    doi: z.string().optional(),
    arxivId: z.string().optional(),
    pmid: z.string().optional(),
    venue: z.string().optional(),
  }),
  sections: z.array(documentSectionSchema),
});

export type DocumentSection = z.infer<typeof documentSectionSchema>;
export type StructuredDocument = z.infer<typeof structuredDocumentSchema>;
