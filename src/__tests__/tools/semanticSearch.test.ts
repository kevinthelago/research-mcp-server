import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../services/rag/embedderFactory.js', () => ({
  createEmbedder: vi.fn().mockResolvedValue({
    dim: 8,
    modelId: 'mock/embedder',
    embed: vi.fn().mockResolvedValue([[0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]]),
  }),
}));

const mockSearch = vi.fn();
vi.mock('../../services/rag/ragIndex.js', () => ({
  RagIndex: vi.fn().mockImplementation(() => ({
    search: mockSearch,
  })),
}));

vi.mock('../../services/rag/lancedbConnection.js', () => ({
  getLanceDb: vi.fn(),
}));

describe('semanticSearchHandler', () => {
  beforeEach(() => {
    vi.resetModules();
    mockSearch.mockReset();
  });

  it('returns JSON with results and no note for a normal search', async () => {
    mockSearch.mockResolvedValue({
      results: [
        {
          chunkId: 'abc',
          paperId: 'p1',
          sectionId: 's1',
          sectionTitle: 'Intro',
          text: 'relevant passage',
          charStart: 0,
          charEnd: 16,
          score: 0.92,
        },
      ],
    });

    const { semanticSearchHandler } = await import('../../tools/semanticSearch.js');
    const response = await semanticSearchHandler({ query: 'test query', topK: 10 });

    expect(response.content).toHaveLength(1);
    const parsed = JSON.parse(response.content[0]!.text) as Record<string, unknown>;
    expect((parsed['results'] as unknown[]).length).toBe(1);
    expect(((parsed['results'] as Record<string, unknown>[])[0])?.['paperId']).toBe('p1');
    expect(parsed).not.toHaveProperty('note');
  });

  it('returns a note when scope is empty', async () => {
    mockSearch.mockResolvedValue({
      results: [],
      note: 'No papers in scope — provide paperIds or omit scope to search all indexed papers.',
    });

    const { semanticSearchHandler } = await import('../../tools/semanticSearch.js');
    const response = await semanticSearchHandler({
      query: 'query',
      scope: { paperIds: [] },
      topK: 10,
    });

    const parsed = JSON.parse(response.content[0]!.text) as Record<string, unknown>;
    expect(parsed['results']).toEqual([]);
    expect((parsed['note'] as string)).toContain('No papers in scope');
  });

  it('passes topK through to the index', async () => {
    mockSearch.mockResolvedValue({ results: [] });

    const { semanticSearchHandler } = await import('../../tools/semanticSearch.js');
    await semanticSearchHandler({ query: 'q', topK: 5 });

    expect(mockSearch).toHaveBeenCalledWith('q', undefined, 5);
  });

  it('passes scope filter through to the index', async () => {
    mockSearch.mockResolvedValue({ results: [] });

    const { semanticSearchHandler } = await import('../../tools/semanticSearch.js');
    await semanticSearchHandler({ query: 'q', scope: { paperIds: ['p1', 'p2'] }, topK: 3 });

    expect(mockSearch).toHaveBeenCalledWith('q', { paperIds: ['p1', 'p2'] }, 3);
  });
});
