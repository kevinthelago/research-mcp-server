import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockIndex = vi.fn();

vi.mock('../../services/rag/embedderFactory.js', () => ({
  createEmbedder: vi.fn().mockResolvedValue({
    dim: 8,
    modelId: 'mock/embedder',
    embed: vi.fn().mockResolvedValue([[0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]]),
  }),
}));

vi.mock('../../services/rag/ragIndex.js', () => ({
  RagIndex: vi.fn().mockImplementation(() => ({
    index: mockIndex,
  })),
}));

vi.mock('../../services/rag/lancedbConnection.js', () => ({
  getLanceDb: vi.fn(),
}));

describe('indexPaperHandler', () => {
  beforeEach(() => {
    vi.resetModules();
    mockIndex.mockReset();
  });

  it('calls ragIndex.index with the document and returns chunk count', async () => {
    mockIndex.mockResolvedValue(7);

    const { indexPaperHandler } = await import('../../tools/ragIndex.js');
    const doc = {
      paperId: 'test-paper',
      metadata: { title: 'Test', authors: [] as string[] },
      sections: [],
    };
    const response = await indexPaperHandler({ paperId: 'test-paper', document: doc });

    expect(mockIndex).toHaveBeenCalledWith(doc);
    expect(response.content).toHaveLength(1);
    const parsed = JSON.parse(response.content[0]!.text) as Record<string, unknown>;
    expect(parsed['paperId']).toBe('test-paper');
    expect(parsed['chunksIndexed']).toBe(7);
  });

  it('returns 0 chunks indexed for an empty document', async () => {
    mockIndex.mockResolvedValue(0);

    const { indexPaperHandler } = await import('../../tools/ragIndex.js');
    const doc = { paperId: 'empty', metadata: { title: 'Empty', authors: [] as string[] }, sections: [] };
    const response = await indexPaperHandler({ paperId: 'empty', document: doc });

    const parsed = JSON.parse(response.content[0]!.text) as Record<string, unknown>;
    expect(parsed['chunksIndexed']).toBe(0);
  });
});
