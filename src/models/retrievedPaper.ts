import { z } from 'zod';

export const PaperMetadataSchema = z.object({
  title: z.string().optional(),
  authors: z.array(z.string()).optional(),
  year: z.number().int().optional(),
  doi: z.string().optional(),
  arxivId: z.string().optional(),
  pmid: z.string().optional(),
  pmcid: z.string().optional(),
  abstract: z.string().optional(),
  journal: z.string().optional(),
  url: z.string().optional(),
});

export type PaperMetadata = z.infer<typeof PaperMetadataSchema>;

export const PaperSourceSchema = z.enum([
  'crossref',
  'arxiv',
  'pubmed',
  'semantic_scholar',
  'user_upload',
  'url',
]);

export type PaperSource = z.infer<typeof PaperSourceSchema>;

export const RetrievedPaperSchema = z.object({
  canonicalId: z.string(),
  metadata: PaperMetadataSchema,
  pdfPath: z.string().optional(),
  hasFullText: z.boolean(),
  source: PaperSourceSchema,
});

export type RetrievedPaper = z.infer<typeof RetrievedPaperSchema>;
