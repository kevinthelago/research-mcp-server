import { describe, it, expect, vi, afterEach } from 'vitest';
import { ApiEmbedder, ApiEmbedderError } from '../../../services/rag/apiEmbedder.js';

function makeVectorResponse(texts: string[], dim: number) {
  return {
    data: texts.map((_, i) => ({
      index: i,
      embedding: Array.from({ length: dim }, (_, j) => (i + j) / 100),
    })),
  };
}

function mockFetch(body: object, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status < 400,
    status,
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(JSON.stringify(body)),
  });
}

vi.mock('undici', () => ({
  fetch: vi.fn(),
}));

async function setFetch(impl: ReturnType<typeof mockFetch>) {
  const mod = await import('undici');
  vi.mocked(mod.fetch).mockImplementation(impl as typeof mod.fetch);
}

describe('ApiEmbedder — Voyage', () => {
  afterEach(() => vi.clearAllMocks());

  it('has correct dim and modelId defaults', () => {
    const embedder = new ApiEmbedder({ provider: 'voyage', apiKey: 'key' });
    expect(embedder.dim).toBe(512);
    expect(embedder.modelId).toBe('voyage/voyage-3-lite');
  });

  it('calls the Voyage endpoint and returns vectors in order', async () => {
    const texts = ['doc one', 'doc two'];
    const responseBody = makeVectorResponse(texts, 512);
    await setFetch(mockFetch(responseBody));

    const embedder = new ApiEmbedder({ provider: 'voyage', apiKey: 'vk-test' });
    const result = await embedder.embed(texts);

    const { fetch } = await import('undici');
    expect(vi.mocked(fetch)).toHaveBeenCalledOnce();
    const [url, opts] = vi.mocked(fetch).mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.voyageai.com/v1/embeddings');
    expect(JSON.parse(opts.body as string)).toMatchObject({
      model: 'voyage-3-lite',
      input: texts,
      input_type: 'document',
    });

    expect(result).toHaveLength(2);
    expect(result[0]).toHaveLength(512);
  });

  it('throws ApiEmbedderError on non-2xx status', async () => {
    await setFetch(mockFetch({ error: 'Unauthorized' }, 401));
    const embedder = new ApiEmbedder({ provider: 'voyage', apiKey: 'bad' });
    await expect(embedder.embed(['text'])).rejects.toThrow(ApiEmbedderError);
    await expect(embedder.embed(['text'])).rejects.toMatchObject({
      provider: 'voyage',
      statusCode: 401,
    });
  });

  it('throws ApiEmbedderError with statusCode 0 on network failure', async () => {
    const { fetch } = await import('undici');
    vi.mocked(fetch).mockRejectedValue(new Error('network error'));
    const embedder = new ApiEmbedder({ provider: 'voyage', apiKey: 'key' });
    const err = await embedder.embed(['x']).catch((e) => e);
    expect(err).toBeInstanceOf(ApiEmbedderError);
    expect((err as ApiEmbedderError).statusCode).toBe(0);
  });
});

describe('ApiEmbedder — OpenAI', () => {
  afterEach(() => vi.clearAllMocks());

  it('has correct dim and modelId defaults', () => {
    const embedder = new ApiEmbedder({ provider: 'openai', apiKey: 'key' });
    expect(embedder.dim).toBe(1536);
    expect(embedder.modelId).toBe('openai/text-embedding-3-small');
  });

  it('calls the OpenAI endpoint without input_type', async () => {
    const texts = ['hello'];
    const responseBody = makeVectorResponse(texts, 1536);
    await setFetch(mockFetch(responseBody));

    const embedder = new ApiEmbedder({ provider: 'openai', apiKey: 'sk-test' });
    await embedder.embed(texts);

    const { fetch } = await import('undici');
    const [url, opts] = vi.mocked(fetch).mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/embeddings');
    const body = JSON.parse(opts.body as string) as Record<string, unknown>;
    expect(body).not.toHaveProperty('input_type');
    expect(body['model']).toBe('text-embedding-3-small');
  });

  it('sorts results by index before returning', async () => {
    const responseBody = {
      data: [
        { index: 1, embedding: Array(1536).fill(0.2) },
        { index: 0, embedding: Array(1536).fill(0.1) },
      ],
    };
    await setFetch(mockFetch(responseBody));
    const embedder = new ApiEmbedder({ provider: 'openai', apiKey: 'k' });
    const [first, second] = await embedder.embed(['a', 'b']);
    expect(first![0]).toBeCloseTo(0.1);
    expect(second![0]).toBeCloseTo(0.2);
  });
});
