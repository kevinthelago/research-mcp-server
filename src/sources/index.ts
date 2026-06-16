import type { UnifiedRecord } from '../models/record.js'

export type { UnifiedRecord }

export interface SearchParams {
  query: string
  limit?: number
  offset?: number
  yearFrom?: number
  yearTo?: number
}

export interface FetchParams {
  doi?: string
  arxivId?: string
  pmid?: string
  pmcid?: string
  s2Id?: string
}

export interface ResolveParams {
  title?: string
  authors?: string[]
  year?: number
  doi?: string
  rawRef?: string
}

export interface SourceAdapter {
  readonly name: string
  search(params: SearchParams): Promise<UnifiedRecord[]>
  fetch(params: FetchParams): Promise<UnifiedRecord | null>
  resolve(params: ResolveParams): Promise<UnifiedRecord | null>
}
