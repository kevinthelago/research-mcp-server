import { describe, it, expect } from 'vitest';
import { detectAndNormalize } from '../../util/identifiers.js';

describe('detectAndNormalize', () => {
  describe('DOI', () => {
    it('detects a bare DOI', () => {
      const result = detectAndNormalize('10.1038/nature12373');
      expect(result).toMatchObject({ type: 'doi', canonical: '10.1038/nature12373' });
    });

    it('normalizes DOI to lowercase', () => {
      const result = detectAndNormalize('10.1093/BIOINFORMATICS/BTX678');
      expect(result?.canonical).toBe('10.1093/bioinformatics/btx678');
    });

    it('extracts DOI from doi.org URL', () => {
      const result = detectAndNormalize('https://doi.org/10.1126/science.abc1234');
      expect(result).toMatchObject({ type: 'doi', canonical: '10.1126/science.abc1234' });
    });

    it('extracts DOI from dx.doi.org URL', () => {
      const result = detectAndNormalize('https://dx.doi.org/10.1016/j.cell.2020.01.001');
      expect(result?.type).toBe('doi');
    });

    it('handles DOI with special characters in suffix', () => {
      const result = detectAndNormalize('10.1002/(SICI)1097-0134(199905)35:2<227::AID-PROT8>3.0.CO;2-H');
      expect(result?.type).toBe('doi');
    });
  });

  describe('arXiv', () => {
    it('detects new-style arXiv ID', () => {
      const result = detectAndNormalize('2101.00001');
      expect(result).toMatchObject({ type: 'arxiv', canonical: '2101.00001' });
    });

    it('detects arXiv ID with version and strips version', () => {
      const result = detectAndNormalize('2101.00001v3');
      expect(result).toMatchObject({ type: 'arxiv', canonical: '2101.00001' });
    });

    it('detects arXiv with explicit prefix', () => {
      const result = detectAndNormalize('arxiv:2301.12345');
      expect(result).toMatchObject({ type: 'arxiv', canonical: '2301.12345' });
    });

    it('detects arXiv from abs URL', () => {
      const result = detectAndNormalize('https://arxiv.org/abs/2301.12345v2');
      expect(result).toMatchObject({ type: 'arxiv', canonical: '2301.12345' });
    });

    it('detects arXiv from pdf URL', () => {
      const result = detectAndNormalize('https://arxiv.org/pdf/1706.03762');
      expect(result).toMatchObject({ type: 'arxiv', canonical: '1706.03762' });
    });

    it('detects old-style arXiv ID', () => {
      const result = detectAndNormalize('hep-th/0301234');
      expect(result).toMatchObject({ type: 'arxiv', canonical: 'hep-th/0301234' });
    });
  });

  describe('PMID', () => {
    it('detects PMID with prefix', () => {
      const result = detectAndNormalize('PMID: 12345678');
      expect(result).toMatchObject({ type: 'pmid', canonical: '12345678' });
    });

    it('detects PMID from PubMed URL', () => {
      const result = detectAndNormalize('https://pubmed.ncbi.nlm.nih.gov/12345678/');
      expect(result).toMatchObject({ type: 'pmid', canonical: '12345678' });
    });

    it('detects PMID:colon without space', () => {
      const result = detectAndNormalize('PMID:9876543');
      expect(result).toMatchObject({ type: 'pmid', canonical: '9876543' });
    });
  });

  describe('PMCID', () => {
    it('detects PMCID', () => {
      const result = detectAndNormalize('PMC3456789');
      expect(result).toMatchObject({ type: 'pmcid', canonical: 'PMC3456789' });
    });

    it('detects PMCID case-insensitively', () => {
      const result = detectAndNormalize('pmc1234567');
      expect(result?.type).toBe('pmcid');
    });

    it('detects PMCID from PMC URL', () => {
      const result = detectAndNormalize('https://pmc.ncbi.nlm.nih.gov/articles/PMC7891011/');
      expect(result).toMatchObject({ type: 'pmcid', canonical: 'PMC7891011' });
    });

    it('prefers PMCID over PMID when both patterns match', () => {
      // A string that has PMC prefix should be a PMCID not a PMID
      const result = detectAndNormalize('PMC12345');
      expect(result?.type).toBe('pmcid');
    });
  });

  describe('URL', () => {
    it('accepts an HTTPS URL as url type', () => {
      const result = detectAndNormalize('https://example.com/paper.pdf');
      expect(result).toMatchObject({ type: 'url', canonical: 'https://example.com/paper.pdf' });
    });

    it('rejects HTTP URLs', () => {
      const result = detectAndNormalize('http://example.com/paper.pdf');
      expect(result).toBeNull();
    });
  });

  describe('unrecognized inputs', () => {
    it('returns null for empty string', () => {
      expect(detectAndNormalize('')).toBeNull();
    });

    it('returns null for plain text', () => {
      expect(detectAndNormalize('Attention is all you need')).toBeNull();
    });

    it('returns null for a bare integer', () => {
      // A bare integer could be a PMID only if prefixed with PMID:
      // Bare integers are ambiguous — we do not guess
      expect(detectAndNormalize('12345678')).toBeNull();
    });
  });

  describe('priority', () => {
    it('prefers DOI-in-URL over bare DOI pattern', () => {
      const result = detectAndNormalize('https://doi.org/10.1000/xyz123');
      expect(result?.type).toBe('doi');
    });
  });
});
