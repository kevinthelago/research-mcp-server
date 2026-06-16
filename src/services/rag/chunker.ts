/** RAG-3: Section-aware text chunker with token-based splitting and overlap. */

import { createHash } from 'crypto';
import { encode } from 'gpt-tokenizer';
import type { StructuredDocument } from '../../contracts/extraction.js';
import type { Chunk } from '../../models/chunk.js';

export interface ChunkerOptions {
  /** Maximum tokens per chunk. Default: 512. */
  targetTokens?: number;
  /** Token overlap between consecutive chunks. Default: 64. */
  overlapTokens?: number;
}

const DEFAULT_TARGET = 512;
const DEFAULT_OVERLAP = 64;

function tokenCount(text: string): number {
  return encode(text).length;
}

function chunkId(paperId: string, sectionId: string, charStart: number, charEnd: number): string {
  return createHash('sha256')
    .update(`${paperId}:${sectionId}:${charStart}:${charEnd}`)
    .digest('hex')
    .slice(0, 16);
}

function makeChunk(
  paperId: string,
  sectionId: string,
  sectionTitle: string,
  text: string,
  charStart: number,
  charEnd: number,
): Chunk {
  return {
    id: chunkId(paperId, sectionId, charStart, charEnd),
    paperId,
    sectionId,
    sectionTitle,
    text,
    charStart,
    charEnd,
    tokenCount: tokenCount(text),
  };
}

/** Split `text` into paragraph spans with their character positions within `text`. */
function paragraphSpans(text: string): Array<{ text: string; start: number; end: number }> {
  const spans: Array<{ text: string; start: number; end: number }> = [];
  const re = /\n\n+/g;
  let lastEnd = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    if (match.index > lastEnd) {
      spans.push({ text: text.slice(lastEnd, match.index), start: lastEnd, end: match.index });
    }
    lastEnd = match.index + match[0].length;
  }
  if (lastEnd < text.length) {
    spans.push({ text: text.slice(lastEnd), start: lastEnd, end: text.length });
  }
  return spans;
}

/**
 * Fallback: slide over `text` by character approximation when there are no
 * paragraph breaks and the text exceeds the target.
 */
function slideChunks(
  text: string,
  paperId: string,
  sectionId: string,
  sectionTitle: string,
  targetTokens: number,
  overlapTokens: number,
): Chunk[] {
  const strideChars = Math.max(1, (targetTokens - overlapTokens) * 4);
  const windowChars = targetTokens * 4;
  const chunks: Chunk[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + windowChars, text.length);
    chunks.push(makeChunk(paperId, sectionId, sectionTitle, text.slice(start, end), start, end));
    if (end >= text.length) break;
    start += strideChars;
  }
  return chunks;
}

function chunkSectionContent(
  content: string,
  paperId: string,
  sectionId: string,
  sectionTitle: string,
  targetTokens: number,
  overlapTokens: number,
): Chunk[] {
  if (!content.trim()) return [];

  if (tokenCount(content) <= targetTokens) {
    return [makeChunk(paperId, sectionId, sectionTitle, content, 0, content.length)];
  }

  const spans = paragraphSpans(content);

  if (spans.length <= 1) {
    return slideChunks(content, paperId, sectionId, sectionTitle, targetTokens, overlapTokens);
  }

  const chunks: Chunk[] = [];
  let buffer: typeof spans = [];
  let bufferTokens = 0;

  for (const span of spans) {
    const spanTokens = tokenCount(span.text);

    if (buffer.length === 0 || bufferTokens + spanTokens <= targetTokens) {
      buffer.push(span);
      bufferTokens += spanTokens;
    } else {
      // Flush current buffer.
      const firstSpan = buffer[0]!;
      const lastSpan = buffer[buffer.length - 1]!;
      const chunkText = buffer.map((s) => s.text).join('\n\n');
      chunks.push(makeChunk(paperId, sectionId, sectionTitle, chunkText, firstSpan.start, lastSpan.end));

      // Build overlap: take paragraphs from the tail of the flushed buffer
      // until we accumulate ≈ overlapTokens.
      const overlapSpans: typeof spans = [];
      let overlapCount = 0;
      for (let i = buffer.length - 1; i >= 0; i--) {
        const s = buffer[i]!;
        const t = tokenCount(s.text);
        if (overlapCount + t > overlapTokens) break;
        overlapSpans.unshift(s);
        overlapCount += t;
      }

      buffer = [...overlapSpans, span];
      bufferTokens = overlapCount + spanTokens;
    }
  }

  if (buffer.length > 0) {
    const firstSpan = buffer[0]!;
    const lastSpan = buffer[buffer.length - 1]!;
    const chunkText = buffer.map((s) => s.text).join('\n\n');
    chunks.push(makeChunk(paperId, sectionId, sectionTitle, chunkText, firstSpan.start, lastSpan.end));
  }

  return chunks;
}

export class Chunker {
  private readonly targetTokens: number;
  private readonly overlapTokens: number;

  constructor(options: ChunkerOptions = {}) {
    this.targetTokens = options.targetTokens ?? DEFAULT_TARGET;
    this.overlapTokens = options.overlapTokens ?? DEFAULT_OVERLAP;
  }

  /**
   * Chunk a StructuredDocument into overlapping token-bounded passages.
   * Abstract (if present) is emitted as sectionId='abstract'.
   */
  chunk(doc: StructuredDocument): Chunk[] {
    const { targetTokens, overlapTokens } = this;
    const results: Chunk[] = [];

    const abstract = doc.metadata.abstract;
    if (abstract?.trim()) {
      results.push(
        ...chunkSectionContent(abstract, doc.paperId, 'abstract', 'Abstract', targetTokens, overlapTokens),
      );
    }

    for (const section of doc.sections) {
      results.push(
        ...chunkSectionContent(
          section.content,
          doc.paperId,
          section.id,
          section.title,
          targetTokens,
          overlapTokens,
        ),
      );

      for (const sub of section.subsections ?? []) {
        results.push(
          ...chunkSectionContent(
            sub.content,
            doc.paperId,
            sub.id,
            sub.title,
            targetTokens,
            overlapTokens,
          ),
        );
      }
    }

    return results;
  }
}
