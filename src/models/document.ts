import { z } from 'zod';

/**
 * Stable ID scheme (deterministic given same PDF through same GROBID version):
 *   Section:   s{n}           top-level, e.g. "s1", "s2"
 *              s{n}.{m}       nested, e.g. "s1.2", "s1.2.3"
 *   Reference: r{n}           e.g. "r1", "r23"
 *   Figure:    f{n}           e.g. "f1" (matches GROBID figure counter)
 *   Table:     t{n}           e.g. "t1" (matches GROBID table counter)
 */

export const DocumentMetadataSchema = z.object({
  title: z.string().optional(),
  authors: z.array(z.string()).default([]),
  abstract: z.string().optional(),
  doi: z.string().optional(),
  arxivId: z.string().optional(),
  pmid: z.string().optional(),
  pmcid: z.string().optional(),
  year: z.number().int().optional(),
  journal: z.string().optional(),
  volume: z.string().optional(),
  issue: z.string().optional(),
  pages: z.string().optional(),
  keywords: z.array(z.string()).default([]),
});

export type DocumentMetadata = z.infer<typeof DocumentMetadataSchema>;

export interface Section {
  id: string;
  title?: string | undefined;
  level: number;
  paragraphs: string[];
  children: Section[];
}

// z.ZodTypeAny avoids inference loop while keeping runtime correctness
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const SectionSchema: z.ZodType<Section, any, any> = z.lazy(() =>
  z.object({
    id: z.string(),
    title: z.string().optional(),
    level: z.number().int().min(1),
    paragraphs: z.array(z.string()),
    children: z.array(SectionSchema),
  }),
);

export const ReferenceSchema = z.object({
  id: z.string(),
  rawText: z.string(),
  resolvedId: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
});

export type Reference = z.infer<typeof ReferenceSchema>;

export const FigureSchema = z.object({
  id: z.string(),
  label: z.string().optional(),
  caption: z.string().optional(),
});

export type Figure = z.infer<typeof FigureSchema>;

export const TableSchema = z.object({
  id: z.string(),
  label: z.string().optional(),
  caption: z.string().optional(),
  content: z.string().optional(),
});

export type Table = z.infer<typeof TableSchema>;

export const ExtractionQualitySchema = z.enum(['full', 'partial', 'metadata-only']);
export type ExtractionQuality = z.infer<typeof ExtractionQualitySchema>;

export const StructuredDocumentSchema = z.object({
  canonicalId: z.string(),
  metadata: DocumentMetadataSchema,
  sections: z.array(SectionSchema),
  references: z.array(ReferenceSchema),
  figures: z.array(FigureSchema),
  tables: z.array(TableSchema),
  fullTextAvailable: z.boolean(),
  extractionQuality: ExtractionQualitySchema,
});

export type StructuredDocument = z.infer<typeof StructuredDocumentSchema>;

/** Typed error returned when a paper has no PDF to extract from. */
export interface NoPdfError {
  kind: 'NoPdfError';
  canonicalId: string;
  message: string;
}

/** Typed error returned when a section/element id is not found in the document. */
export interface ElementNotFoundError {
  kind: 'ElementNotFoundError';
  id: string;
  documentId: string;
  message: string;
}

/** Typed error returned when GROBID is unreachable. */
export interface GrobidUnavailableError {
  kind: 'GrobidUnavailableError';
  message: string;
  hint: string;
}

export type ExtractionError = NoPdfError | ElementNotFoundError | GrobidUnavailableError;

export function makeNoPdfError(canonicalId: string): NoPdfError {
  return {
    kind: 'NoPdfError',
    canonicalId,
    message: `Paper "${canonicalId}" has no stored PDF. Use ingest_pdf to provide one before extracting.`,
  };
}

export function makeElementNotFoundError(id: string, documentId: string): ElementNotFoundError {
  return {
    kind: 'ElementNotFoundError',
    id,
    documentId,
    message: `Element "${id}" not found in document "${documentId}".`,
  };
}

export function makeGrobidUnavailableError(cause?: string): GrobidUnavailableError {
  return {
    kind: 'GrobidUnavailableError',
    message: cause ?? 'GROBID service is not reachable.',
    hint: 'Start GROBID with: docker run --rm -p 8070:8070 lfoppiano/grobid:0.8.0',
  };
}

/** Collect all element ids in a document for fast lookup. */
export function collectElementIds(doc: StructuredDocument): Set<string> {
  const ids = new Set<string>();
  const walkSection = (s: Section) => {
    ids.add(s.id);
    s.children.forEach(walkSection);
  };
  doc.sections.forEach(walkSection);
  doc.references.forEach((r) => ids.add(r.id));
  doc.figures.forEach((f) => ids.add(f.id));
  doc.tables.forEach((tb) => ids.add(tb.id));
  return ids;
}

/** Find a section subtree by id (returns undefined if not found). */
export function findSection(sections: Section[], id: string): Section | undefined {
  for (const s of sections) {
    if (s.id === id) return s;
    const found = findSection(s.children, id);
    if (found) return found;
  }
  return undefined;
}
