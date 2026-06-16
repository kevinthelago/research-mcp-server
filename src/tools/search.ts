import { z } from 'zod'
import type { SearchService } from '../services/search/SearchService.js'

export const searchInputSchema = {
  query: z.string().describe('Search query for academic papers'),
  sources: z
    .array(z.enum(['arxiv', 'semantic-scholar', 'pubmed', 'crossref']))
    .optional()
    .describe('Filter to specific sources (default: all)'),
  limit: z.number().int().min(1).max(100).optional().default(10),
  offset: z.number().int().min(0).optional().default(0),
  yearFrom: z.number().int().min(1900).max(2100).optional(),
  yearTo: z.number().int().min(1900).max(2100).optional(),
}

type SearchInput = z.infer<z.ZodObject<typeof searchInputSchema>>

interface SearchContext {
  services: { searchService: SearchService }
  logger: { error: (...args: unknown[]) => void }
}

export const searchToolDef = {
  name: 'search',
  description:
    'Search academic papers across arXiv, Semantic Scholar, PubMed, and Crossref. Returns normalized records with IDs, authors, abstract, venue, and open-access links.',
  inputSchema: searchInputSchema,
  handler: async (
    input: SearchInput,
    ctx: SearchContext,
  ): Promise<{ content: Array<{ type: 'text'; text: string }> }> => {
    try {
      const opts: import('../services/search/SearchService.js').SearchOptions = {
        query: input.query,
        limit: input.limit ?? 10,
        offset: input.offset ?? 0,
        ...(input.sources !== undefined ? { sources: input.sources } : {}),
        ...(input.yearFrom !== undefined ? { yearFrom: input.yearFrom } : {}),
        ...(input.yearTo !== undefined ? { yearTo: input.yearTo } : {}),
      }
      const result = await ctx.services.searchService.search(opts)
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
    } catch (err) {
      ctx.logger.error('search tool error', err)
      const msg = err instanceof Error ? err.message : 'Unknown error'
      return { content: [{ type: 'text', text: JSON.stringify({ error: msg }) }] }
    }
  },
}
