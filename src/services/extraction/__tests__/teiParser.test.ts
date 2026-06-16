import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseTeiXml } from '../teiParser.js';

const FIXTURE_DIR = resolve(fileURLToPath(import.meta.url), '../../__fixtures__');
const sampleXml = readFileSync(resolve(FIXTURE_DIR, 'sample.tei.xml'), 'utf8');

describe('parseTeiXml', () => {
  it('parses title and authors', () => {
    const doc = parseTeiXml('test-paper-1', sampleXml);
    expect(doc.metadata.title).toBe('Attention Is All You Need');
    expect(doc.metadata.authors).toEqual(['Ashish Vaswani', 'Noam Shazeer']);
  });

  it('parses doi and arxivId', () => {
    const doc = parseTeiXml('test-paper-1', sampleXml);
    expect(doc.metadata.doi).toBe('10.48550/arXiv.1706.03762');
    expect(doc.metadata.arxivId).toBe('1706.03762');
  });

  it('parses year', () => {
    const doc = parseTeiXml('test-paper-1', sampleXml);
    expect(doc.metadata.year).toBe(2017);
  });

  it('parses abstract', () => {
    const doc = parseTeiXml('test-paper-1', sampleXml);
    expect(doc.metadata.abstract).toContain('Transformer');
  });

  it('assigns stable hierarchical section ids', () => {
    const doc = parseTeiXml('test-paper-1', sampleXml);
    expect(doc.sections[0]?.id).toBe('s1');
    expect(doc.sections[0]?.title).toBe('Introduction');
    expect(doc.sections[0]?.children[0]?.id).toBe('s1.1');
    expect(doc.sections[0]?.children[0]?.title).toBe('Motivation');
    expect(doc.sections[1]?.id).toBe('s2');
    expect(doc.sections[1]?.title).toBe('Background');
  });

  it('parses section paragraphs', () => {
    const doc = parseTeiXml('test-paper-1', sampleXml);
    expect(doc.sections[0]?.paragraphs.length).toBe(2);
    expect(doc.sections[0]?.paragraphs[0]).toContain('Recurrent neural');
  });

  it('assigns stable reference ids', () => {
    const doc = parseTeiXml('test-paper-1', sampleXml);
    expect(doc.references.length).toBe(2);
    expect(doc.references[0]?.id).toBe('r1');
    expect(doc.references[1]?.id).toBe('r2');
  });

  it('builds reference raw text', () => {
    const doc = parseTeiXml('test-paper-1', sampleXml);
    expect(doc.references[0]?.rawText).toContain('Bahdanau');
  });

  it('parses figures', () => {
    const doc = parseTeiXml('test-paper-1', sampleXml);
    expect(doc.figures.length).toBe(1);
    expect(doc.figures[0]?.id).toBe('f1');
    expect(doc.figures[0]?.label).toBe('Figure 1');
    expect(doc.figures[0]?.caption).toContain('Transformer model architecture');
  });

  it('parses tables', () => {
    const doc = parseTeiXml('test-paper-1', sampleXml);
    expect(doc.tables.length).toBe(1);
    expect(doc.tables[0]?.id).toBe('t1');
    expect(doc.tables[0]?.label).toBe('Table 1');
    expect(doc.tables[0]?.content).toContain('Self-Attention');
  });

  it('sets fullTextAvailable=true for a real document', () => {
    const doc = parseTeiXml('test-paper-1', sampleXml);
    expect(doc.fullTextAvailable).toBe(true);
  });

  it('infers full extractionQuality', () => {
    const doc = parseTeiXml('test-paper-1', sampleXml);
    expect(doc.extractionQuality).toBe('full');
  });

  it('infers metadata-only quality from empty TEI body', () => {
    const emptyBodyXml = sampleXml
      .replace(/<body>[\s\S]*?<\/body>/, '<body></body>')
      .replace(/<back>[\s\S]*?<\/back>/, '<back></back>');
    const doc = parseTeiXml('empty', emptyBodyXml);
    expect(doc.fullTextAvailable).toBe(false);
    expect(doc.extractionQuality).toBe('metadata-only');
  });

  it('sets canonicalId correctly', () => {
    const doc = parseTeiXml('arxiv:1706.03762', sampleXml);
    expect(doc.canonicalId).toBe('arxiv:1706.03762');
  });
});
