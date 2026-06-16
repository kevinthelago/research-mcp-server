export type IdType = 'doi' | 'arxiv' | 'pmid' | 'pmcid' | 'url';

export interface NormalizedId {
  type: IdType;
  /** Canonical form used as cache key and for API calls */
  canonical: string;
  raw: string;
}

// DOI: starts with 10. followed by registrant/suffix
const DOI_RE = /\b(10\.\d{4,}(?:\.\d+)*\/\S+)/i;
// DOI wrapped in URL prefix
const DOI_URL_RE = /(?:https?:\/\/)?(?:dx\.)?doi\.org\/(10\.\d{4,}(?:\.\d+)*\/\S+)/i;

// arXiv IDs: new style (YYMM.NNNNN[vN]) or old style (category/YYMMNNN)
const ARXIV_NEW_RE = /\b(\d{4}\.\d{4,5}(?:v\d+)?)\b/;
const ARXIV_OLD_RE = /\b([a-z-]+(?:\.[A-Z]{2})?\/\d{7}(?:v\d+)?)\b/;
const ARXIV_PREFIX_RE = /(?:arxiv[:\s]+)(\d{4}\.\d{4,5}(?:v\d+)?|[a-z-]+(?:\.[A-Z]{2})?\/\d{7}(?:v\d+)?)/i;
const ARXIV_URL_RE = /arxiv\.org\/(?:abs|pdf)\/(\d{4}\.\d{4,5}(?:v\d+)?|[a-z-]+(?:\.[A-Z]{2})?\/\d{7}(?:v\d+)?)/i;

// PMCID: PMC followed by digits
const PMCID_RE = /\bPMC(\d+)\b/i;
// PMID: plain integer, often prefixed
const PMID_PREFIX_RE = /\bPMID[:\s]*(\d+)\b/i;
// PubMed URL
const PUBMED_URL_RE = /pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)/i;
const PMC_URL_RE = /pmc\.ncbi\.nlm\.nih\.gov\/articles\/PMC(\d+)/i;

/** Strips the version suffix from an arXiv ID (e.g. 2101.00001v2 → 2101.00001) */
function stripArxivVersion(id: string): string {
  return id.replace(/v\d+$/, '');
}

/**
 * Detects and normalizes an identifier string into a canonical form.
 *
 * Detection priority: DOI-in-URL > DOI bare > PMCID > PMID > arXiv URL >
 * arXiv-prefixed > arXiv bare > HTTP URL.
 *
 * Returns null when the input cannot be recognized as any supported id type.
 */
export function detectAndNormalize(input: string): NormalizedId | null {
  const trimmed = input.trim();

  // 1. DOI embedded in a doi.org URL (must come before bare DOI to avoid
  //    partial matching the URL path)
  const doiUrlMatch = DOI_URL_RE.exec(trimmed);
  if (doiUrlMatch?.[1] != null) {
    return { type: 'doi', canonical: doiUrlMatch[1].toLowerCase(), raw: trimmed };
  }

  // 2. Bare DOI
  const doiMatch = DOI_RE.exec(trimmed);
  if (doiMatch?.[1] != null) {
    return { type: 'doi', canonical: doiMatch[1].toLowerCase(), raw: trimmed };
  }

  // 3. PMCID (PMC followed by number) — check before PMID
  const pmcUrlMatch = PMC_URL_RE.exec(trimmed);
  if (pmcUrlMatch?.[1] != null) {
    return { type: 'pmcid', canonical: `PMC${pmcUrlMatch[1]}`, raw: trimmed };
  }
  const pmcidMatch = PMCID_RE.exec(trimmed);
  if (pmcidMatch?.[1] != null) {
    return { type: 'pmcid', canonical: `PMC${pmcidMatch[1]}`, raw: trimmed };
  }

  // 4. PMID
  const pubmedUrlMatch = PUBMED_URL_RE.exec(trimmed);
  if (pubmedUrlMatch?.[1] != null) {
    return { type: 'pmid', canonical: pubmedUrlMatch[1], raw: trimmed };
  }
  const pmidPrefixMatch = PMID_PREFIX_RE.exec(trimmed);
  if (pmidPrefixMatch?.[1] != null) {
    return { type: 'pmid', canonical: pmidPrefixMatch[1], raw: trimmed };
  }

  // 5. arXiv URL
  const arxivUrlMatch = ARXIV_URL_RE.exec(trimmed);
  if (arxivUrlMatch?.[1] != null) {
    return {
      type: 'arxiv',
      canonical: stripArxivVersion(arxivUrlMatch[1]),
      raw: trimmed,
    };
  }

  // 6. arXiv with explicit prefix ("arxiv:XXXX" or "arxiv XXXX")
  const arxivPrefixMatch = ARXIV_PREFIX_RE.exec(trimmed);
  if (arxivPrefixMatch?.[1] != null) {
    return {
      type: 'arxiv',
      canonical: stripArxivVersion(arxivPrefixMatch[1]),
      raw: trimmed,
    };
  }

  // 7. Bare arXiv new-style (YYMM.NNNNN) — high-confidence pattern
  const arxivNewMatch = ARXIV_NEW_RE.exec(trimmed);
  if (arxivNewMatch?.[1] != null) {
    return {
      type: 'arxiv',
      canonical: stripArxivVersion(arxivNewMatch[1]),
      raw: trimmed,
    };
  }

  // 8. Bare arXiv old-style (category/YYMMNNN)
  const arxivOldMatch = ARXIV_OLD_RE.exec(trimmed);
  if (arxivOldMatch?.[1] != null) {
    return {
      type: 'arxiv',
      canonical: stripArxivVersion(arxivOldMatch[1]),
      raw: trimmed,
    };
  }

  // 9. Generic HTTPS URL (fallback — only accept HTTPS)
  if (/^https:\/\//i.test(trimmed)) {
    return { type: 'url', canonical: trimmed, raw: trimmed };
  }

  return null;
}
