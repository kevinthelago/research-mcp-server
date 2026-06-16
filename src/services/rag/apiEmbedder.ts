/** RAG-2: REST API embedder supporting Voyage AI and OpenAI. */

import { fetch } from 'undici';
import type { Embedder } from './embedder.js';

export type ApiEmbedderProvider = 'voyage' | 'openai';

export interface ApiEmbedderConfig {
  provider: ApiEmbedderProvider;
  apiKey: string;
  /** Defaults: voyage → 'voyage-3-lite', openai → 'text-embedding-3-small' */
  model?: string;
}

const PROVIDER_DEFAULTS: Record<
  ApiEmbedderProvider,
  { model: string; url: string; dim: number }
> = {
  voyage: {
    model: 'voyage-3-lite',
    url: 'https://api.voyageai.com/v1/embeddings',
    dim: 512,
  },
  openai: {
    model: 'text-embedding-3-small',
    url: 'https://api.openai.com/v1/embeddings',
    dim: 1536,
  },
};

export class ApiEmbedderError extends Error {
  constructor(
    public readonly provider: ApiEmbedderProvider,
    public readonly statusCode: number,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'ApiEmbedderError';
  }
}

export class ApiEmbedder implements Embedder {
  private readonly _modelId: string;
  private readonly _dim: number;
  private readonly _url: string;
  private readonly _apiKey: string;
  private readonly _provider: ApiEmbedderProvider;

  constructor(config: ApiEmbedderConfig) {
    const defaults = PROVIDER_DEFAULTS[config.provider];
    this._provider = config.provider;
    this._apiKey = config.apiKey;
    this._modelId = config.model ?? defaults.model;
    this._dim = defaults.dim;
    this._url = defaults.url;
  }

  get dim(): number {
    return this._dim;
  }

  get modelId(): string {
    return `${this._provider}/${this._modelId}`;
  }

  async embed(texts: string[]): Promise<number[][]> {
    const body =
      this._provider === 'voyage'
        ? { model: this._modelId, input: texts, input_type: 'document' }
        : { model: this._modelId, input: texts };

    let res: Response;
    try {
      res = await fetch(this._url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this._apiKey}`,
        },
        body: JSON.stringify(body),
      }) as unknown as Response;
    } catch (cause) {
      throw new ApiEmbedderError(
        this._provider,
        0,
        `Network error calling ${this._provider} embeddings API`,
        { cause },
      );
    }

    if (!res.ok) {
      const errorText = await res.text().catch(() => '');
      throw new ApiEmbedderError(
        this._provider,
        res.status,
        `${this._provider} embeddings API returned ${res.status}: ${errorText}`,
      );
    }

    const json = (await res.json()) as {
      data: Array<{ embedding: number[]; index: number }>;
    };

    return json.data
      .sort((a, b) => a.index - b.index)
      .map((d) => d.embedding);
  }
}
