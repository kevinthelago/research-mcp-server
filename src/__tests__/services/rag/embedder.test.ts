import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LocalEmbedder } from '../../../services/rag/embedder.js';

vi.mock('@xenova/transformers', () => {
  const dim = 384;
  const mockPipe = vi.fn(async (text: string, _opts: object) => {
    const data = new Float32Array(dim).fill(0);
    for (let i = 0; i < dim; i++) data[i] = ((text.length + i) % 100) / 100;
    return { data, dims: [1, dim] };
  });
  return {
    pipeline: vi.fn().mockResolvedValue(mockPipe),
    env: { allowLocalModels: true },
  };
});

describe('LocalEmbedder', () => {
  let embedder: LocalEmbedder;

  beforeEach(() => {
    vi.clearAllMocks();
    embedder = new LocalEmbedder();
  });

  it('exposes correct dim and modelId', () => {
    expect(embedder.dim).toBe(384);
    expect(embedder.modelId).toBe('Xenova/bge-small-en-v1.5');
  });

  it('returns one vector per text with correct dimension', async () => {
    const texts = ['hello world', 'another sentence here', 'third'];
    const embeddings = await embedder.embed(texts);

    expect(embeddings).toHaveLength(3);
    for (const vec of embeddings) {
      expect(vec).toHaveLength(384);
      expect(vec.every((v) => typeof v === 'number')).toBe(true);
    }
  });

  it('returns distinct vectors for distinct texts', async () => {
    const embeddings = await embedder.embed(['hello', 'goodbye']);
    expect(embeddings[0]).not.toEqual(embeddings[1]);
  });

  it('reuses the pipeline across multiple embed() calls', async () => {
    const { pipeline } = await import('@xenova/transformers');
    await embedder.embed(['a']);
    await embedder.embed(['b']);
    expect(pipeline).toHaveBeenCalledTimes(1);
  });

  it('handles empty input gracefully', async () => {
    const result = await embedder.embed([]);
    expect(result).toEqual([]);
  });
});
