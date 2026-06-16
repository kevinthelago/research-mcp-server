/** RAG-1: Pluggable embedding interface + local ONNX embedder. */

export interface Embedder {
  embed(texts: string[]): Promise<number[][]>;
  readonly dim: number;
  readonly modelId: string;
}

/**
 * Local embedder using @xenova/transformers (bge-small-en-v1.5, ONNX).
 * No API key required; model is downloaded from HuggingFace Hub on first use.
 */
export class LocalEmbedder implements Embedder {
  static readonly MODEL_ID = 'Xenova/bge-small-en-v1.5';
  static readonly DIM = 384;

  // Typed as unknown; cast via getPipe() to avoid @xenova/transformers type coupling.
  private pipe: unknown = null;

  get dim(): number {
    return LocalEmbedder.DIM;
  }

  get modelId(): string {
    return LocalEmbedder.MODEL_ID;
  }

  async embed(texts: string[]): Promise<number[][]> {
    const pipe = await this.getPipe();
    const results: number[][] = [];
    for (const text of texts) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const output = (await (pipe as any)(text, { pooling: 'mean', normalize: true })) as {
        data: Float32Array;
        dims: number[];
      };
      results.push(Array.from(output.data));
    }
    return results;
  }

  private async getPipe(): Promise<unknown> {
    if (!this.pipe) {
      const { pipeline } = await import('@xenova/transformers');
      this.pipe = await pipeline('feature-extraction', LocalEmbedder.MODEL_ID);
    }
    return this.pipe;
  }
}
