import { z } from 'zod'

export const RecordIdsSchema = z.object({
  doi: z.string().optional(),
  arxivId: z.string().optional(),
  pmid: z.string().optional(),
  pmcid: z.string().optional(),
  s2Id: z.string().optional(),
})

export type RecordIds = z.infer<typeof RecordIdsSchema>

export const UnifiedRecordSchema = z.object({
  ids: RecordIdsSchema,
  title: z.string(),
  authors: z.array(z.string()),
  abstract: z.string().optional(),
  venue: z.string().optional(),
  year: z.number().int().optional(),
  url: z.string().optional(),
  sources: z.array(z.string()),
  citationCount: z.number().int().optional(),
  openAccessPdfUrl: z.string().optional(),
})

export type UnifiedRecord = z.infer<typeof UnifiedRecordSchema>
