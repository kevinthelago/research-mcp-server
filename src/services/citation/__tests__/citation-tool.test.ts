import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerCitationTool, type CitationCache } from '../../../tools/citation.js';
import { CitationResolver } from '../CitationResolver.js';
import type { IDocumentStore, ISearchAdapter, ParsedReference, StructuredDocument } from '../types.js';

/* ---------- helpers ---------------------------------------------------- */

function makeAdapter(candidates: object[] = []): ISearchAdapter {
  return { resolve: vi.fn().mockResolvedValue(candidates) };
}

function makeRef(overrides: Partial<ParsedReference> = {}): ParsedReference {
  return { rawString: 'Raw ref string', resolvedId: null, confidence: 0, ...overrides };
}

function makeDoc(refs: ParsedReference[]): StructuredDocument {
  return { id: 'doc-1', references: refs };
}

/** Minimal McpServer mock that captures registered tool handlers */
function makeMockServer() {
  const tools: Record<string, (args: Record<string, unknown>) => Promise<unknown>> = {};
  const server = {
    tool: vi.fn((name: string, _desc: string, _schema: unknown, handler: (args: Record<string, unknown>) => Promise<unknown>) => {
      tools[name] = handler;
    }),
    callTool: async (name: string, args: Record<string, unknown>) => tools[name]?.(args),
  };
  return server;
}

function makeStore(doc: StructuredDocument | null = null): IDocumentStore & { _stored: ParsedReference[] } {
  const store = {
    _stored: [] as ParsedReference[],
    getDocument: vi.fn().mockResolvedValue(doc),
    updateDocumentReferences: vi.fn().mockImplementation((_id: string, refs: ParsedReference[]) => {
      store._stored = refs;
      return Promise.resolve();
    }),
  };
  return store;
}

/* ---------- tests ------------------------------------------------------- */

describe('resolve_citations tool', () => {
  let cache: CitationCache;

  beforeEach(() => {
    cache = new Map();
  });

  it('returns isError when document not found', async () => {
    const server = makeMockServer();
    const store = makeStore(null);
    const resolver = new CitationResolver(makeAdapter(), makeAdapter());
    registerCitationTool(server as never, { store, resolver, cache });

    const result = await server.callTool('resolve_citations', { documentId: 'missing' }) as {
      isError?: boolean;
      content: Array<{ type: string; text: string }>;
    };

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toMatch(/not found/i);
  });

  it('resolves unresolved references and writes them back', async () => {
    const refs = [
      makeRef({ title: 'Attention Is All You Need', authors: ['Vaswani'], year: 2017 }),
    ];
    const doc = makeDoc(refs);
    const store = makeStore(doc);

    const crossref = makeAdapter([{
      id: 'doi:10.5555/vaswani',
      title: 'Attention Is All You Need',
      authors: ['Vaswani'],
      year: 2017,
    }]);
    const resolver = new CitationResolver(crossref, makeAdapter(), { confidenceThreshold: 0.7 });
    const server = makeMockServer();
    registerCitationTool(server as never, { store, resolver, cache });

    const result = await server.callTool('resolve_citations', { documentId: 'doc-1' }) as {
      content: Array<{ type: string; text: string }>;
    };

    const body = JSON.parse(result.content[0]!.text) as { summary: { resolved: number } };
    expect(body.summary.resolved).toBe(1);
    expect(store._stored[0]?.resolvedId).toBe('doi:10.5555/vaswani');
  });

  it('skips already-resolved references by default', async () => {
    const refs = [
      makeRef({ resolvedId: 'doi:10.5555/existing', confidence: 0.9 }),
    ];
    const doc = makeDoc(refs);
    const store = makeStore(doc);
    const crossref = makeAdapter([{ id: 'doi:10.5555/other', title: 'Other' }]);
    const resolver = new CitationResolver(crossref, makeAdapter());
    const server = makeMockServer();
    registerCitationTool(server as never, { store, resolver, cache });

    await server.callTool('resolve_citations', { documentId: 'doc-1' });

    // Adapter should not have been called since the reference was already resolved
    expect(crossref.resolve).not.toHaveBeenCalled();
  });

  it('re-resolves everything when forceRefresh is true', async () => {
    const refs = [makeRef({ resolvedId: 'doi:10.5555/old', confidence: 0.9, title: 'Paper' })];
    const doc = makeDoc(refs);
    const store = makeStore(doc);
    const crossref = makeAdapter([{ id: 'doi:10.5555/new', title: 'Paper', year: 2020 }]);
    const resolver = new CitationResolver(crossref, makeAdapter(), { confidenceThreshold: 0.5 });
    const server = makeMockServer();
    registerCitationTool(server as never, { store, resolver, cache });

    await server.callTool('resolve_citations', { documentId: 'doc-1', forceRefresh: true });

    expect(crossref.resolve).toHaveBeenCalled();
  });

  it('caches results and skips the network on second call', async () => {
    const refs = [makeRef({ title: 'Cacheable Paper', year: 2022 })];
    const doc = makeDoc(refs);
    const store = makeStore(doc);
    const crossref = makeAdapter([{ id: 'doi:10.5555/cached', title: 'Cacheable Paper', year: 2022 }]);
    const resolver = new CitationResolver(crossref, makeAdapter(), { confidenceThreshold: 0.5 });
    const server = makeMockServer();
    registerCitationTool(server as never, { store, resolver, cache });

    // First call — network hit
    await server.callTool('resolve_citations', { documentId: 'doc-1' });
    const firstCallCount = vi.mocked(crossref.resolve).mock.calls.length;

    // Reset resolved state so the ref is eligible again
    const freshRef = makeRef({ title: 'Cacheable Paper', year: 2022 });
    store.getDocument = vi.fn().mockResolvedValue(makeDoc([freshRef]));

    // Second call — should hit cache
    await server.callTool('resolve_citations', { documentId: 'doc-1' });
    expect(vi.mocked(crossref.resolve).mock.calls.length).toBe(firstCallCount);
  });
});
