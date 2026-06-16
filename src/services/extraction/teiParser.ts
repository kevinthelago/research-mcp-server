import { XMLParser } from 'fast-xml-parser';
import type {
  DocumentMetadata,
  ExtractionQuality,
  Figure,
  Reference,
  Section,
  StructuredDocument,
  Table,
} from '../../models/document.js';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  parseTagValue: false,
  parseAttributeValue: false,
  isArray: (name) =>
    ['author', 'div', 'p', 'biblStruct', 'figure', 'ref', 'keyword', 'row', 'cell'].includes(name),
  removeNSPrefix: true,
});

export function parseTeiXml(canonicalId: string, xml: string): StructuredDocument {
  const root = parser.parse(xml);
  const tei = root?.TEI ?? root?.tei ?? {};
  const header = tei?.teiHeader ?? {};
  const text = tei?.text ?? {};
  const body = text?.body ?? {};
  const back = text?.back ?? {};

  const metadata = parseMetadata(header);
  const sections = parseSections(body?.div ?? []);
  const references = parseReferences(back?.div ?? [], back?.listBibl ?? {});
  const { figures, tables } = parseFiguresAndTables(body);

  const quality = inferQuality(sections, references);

  return {
    canonicalId,
    metadata,
    sections,
    references,
    figures,
    tables,
    fullTextAvailable: sections.length > 0,
    extractionQuality: quality,
  };
}

// ---- Metadata ----------------------------------------------------------------

function parseMetadata(header: Record<string, unknown>): DocumentMetadata {
  const fileDesc = (header?.fileDesc ?? {}) as Record<string, unknown>;
  const profileDesc = (header?.profileDesc ?? {}) as Record<string, unknown>;
  const titleStmt = (fileDesc?.titleStmt ?? {}) as Record<string, unknown>;
  const sourceDesc = (fileDesc?.sourceDesc ?? {}) as Record<string, unknown>;
  const biblStruct = (
    Array.isArray(sourceDesc?.biblStruct) ? sourceDesc?.biblStruct[0] : sourceDesc?.biblStruct
  ) as Record<string, unknown> | undefined;

  const title = extractText(
    (Array.isArray(titleStmt?.title) ? titleStmt?.title[0] : titleStmt?.title) as
      | string
      | Record<string, unknown>
      | undefined,
  );

  const analytic = (biblStruct?.analytic ?? {}) as Record<string, unknown>;
  const monogr = (biblStruct?.monogr ?? {}) as Record<string, unknown>;
  const series = (biblStruct?.series ?? {}) as Record<string, unknown>;
  void series;

  const authors = parseAuthors([
    ...asArray(analytic?.author),
    ...asArray((monogr as Record<string, unknown>)?.author),
  ]);

  const doi = findIdno(biblStruct, 'DOI') ?? findIdno(analytic, 'DOI');
  const arxivId = findIdno(biblStruct, 'arxiv') ?? findIdno(analytic, 'arxiv');
  const pmid = findIdno(biblStruct, 'PMID') ?? findIdno(analytic, 'PMID');
  const pmcid = findIdno(biblStruct, 'PMCID') ?? findIdno(analytic, 'PMCID');

  const imprint = (monogr?.imprint ?? {}) as Record<string, unknown>;
  const date = imprint?.date as Record<string, unknown> | string | undefined;
  const year = parseYear(date);

  const journalTitle = extractText(
    (monogr?.title ?? analytic?.title) as string | Record<string, unknown> | undefined,
  );

  const abstract = extractAbstract(profileDesc);
  const keywords = extractKeywords(profileDesc);

  return {
    title: title || undefined,
    authors,
    abstract: abstract || undefined,
    doi: doi || undefined,
    arxivId: arxivId || undefined,
    pmid: pmid || undefined,
    pmcid: pmcid || undefined,
    year: year || undefined,
    journal: journalTitle || undefined,
    keywords,
  };
}

function parseAuthors(authors: unknown[]): string[] {
  return authors.flatMap((a) => {
    if (!a || typeof a !== 'object') return [];
    const au = a as Record<string, unknown>;
    const persName = au?.persName as Record<string, unknown> | undefined;
    if (!persName) return [];
    const forename = asArray(persName.forename)
      .map((f) => extractText(f as string | Record<string, unknown>))
      .filter(Boolean)
      .join(' ');
    const surname = extractText(persName.surname as string | Record<string, unknown> | undefined);
    const name = [forename, surname].filter(Boolean).join(' ');
    return name ? [name] : [];
  });
}

function findIdno(
  obj: Record<string, unknown> | undefined,
  type: string,
): string | undefined {
  if (!obj) return undefined;
  const idnos = asArray(obj.idno);
  for (const idno of idnos) {
    if (!idno || typeof idno !== 'object') continue;
    const i = idno as Record<string, unknown>;
    if (i['@_type'] === type) {
      return extractText(i) || undefined;
    }
  }
  return undefined;
}

function parseYear(date: Record<string, unknown> | string | undefined): number | undefined {
  if (!date) return undefined;
  const when =
    typeof date === 'object' ? (date['@_when'] as string | undefined) : undefined;
  const str = when ?? (typeof date === 'string' ? date : undefined);
  if (!str) return undefined;
  const m = str.match(/\d{4}/);
  return m ? parseInt(m[0], 10) : undefined;
}

function extractAbstract(profileDesc: Record<string, unknown>): string {
  const abstract = profileDesc?.abstract as Record<string, unknown> | undefined;
  if (!abstract) return '';
  const ps = asArray(abstract.p ?? abstract.div).map((p) =>
    extractText(p as string | Record<string, unknown>),
  );
  return ps.filter(Boolean).join('\n\n').trim();
}

function extractKeywords(profileDesc: Record<string, unknown>): string[] {
  const textClass = profileDesc?.textClass as Record<string, unknown> | undefined;
  if (!textClass) return [];
  const keywords = asArray(textClass.keywords);
  return keywords.flatMap((kw) => {
    const k = kw as Record<string, unknown>;
    return asArray(k?.term ?? k?.keyword).map((t) =>
      extractText(t as string | Record<string, unknown>),
    );
  }).filter(Boolean) as string[];
}

// ---- Sections ----------------------------------------------------------------

function parseSections(divs: unknown[], parentId = '', level = 1): Section[] {
  return asArray(divs).map((div, i) => {
    const d = div as Record<string, unknown>;
    const id = parentId ? `${parentId}.${i + 1}` : `s${i + 1}`;
    const headEl = d?.head as string | Record<string, unknown> | undefined;
    const titleStr = extractText(headEl);
    const paragraphs = asArray(d?.p).map((p) =>
      extractText(p as string | Record<string, unknown>),
    ).filter(Boolean) as string[];
    const children = parseSections(asArray(d?.div), id, level + 1);
    const section: Section = { id, level, paragraphs, children };
    if (titleStr) section.title = titleStr;
    return section;
  });
}

// ---- References --------------------------------------------------------------

function parseReferences(
  backDivs: unknown[],
  listBiblRoot: Record<string, unknown>,
): Reference[] {
  // GROBID puts references in back/div[@type='references']/listBibl or directly in back/listBibl
  let biblStructs: unknown[] = asArray(listBiblRoot?.biblStruct);

  if (biblStructs.length === 0) {
    for (const div of asArray(backDivs)) {
      const d = div as Record<string, unknown>;
      if ((d['@_type'] ?? d['@_subtype']) === 'references') {
        biblStructs = asArray((d?.listBibl as Record<string, unknown>)?.biblStruct);
        break;
      }
    }
  }

  return biblStructs.map((bib, i) => {
    const b = bib as Record<string, unknown>;
    const id = `r${i + 1}`;
    const rawText = buildRefRawText(b);
    return { id, rawText };
  });
}

function buildRefRawText(bib: Record<string, unknown>): string {
  // Reconstruct a human-readable string from analytic + monogr fields
  const analytic = (bib?.analytic ?? {}) as Record<string, unknown>;
  const monogr = (bib?.monogr ?? {}) as Record<string, unknown>;

  const authors = parseAuthors([...asArray(analytic?.author), ...asArray(monogr?.author)]);
  const title =
    extractText(analytic?.title as string | Record<string, unknown> | undefined) ||
    extractText(monogr?.title as string | Record<string, unknown> | undefined);
  const imprint = (monogr?.imprint ?? {}) as Record<string, unknown>;
  const date = imprint?.date as Record<string, unknown> | string | undefined;
  const year = parseYear(date);
  const journal = extractText(monogr?.title as string | Record<string, unknown> | undefined);

  const parts = [
    authors.join(', '),
    title && title !== journal ? `"${title}"` : undefined,
    journal,
    year ? String(year) : undefined,
  ].filter(Boolean);

  return parts.join('. ');
}

// ---- Figures and Tables ------------------------------------------------------

function parseFiguresAndTables(body: Record<string, unknown>): {
  figures: Figure[];
  tables: Table[];
} {
  const figures: Figure[] = [];
  const tables: Table[] = [];
  let figIdx = 0;
  let tblIdx = 0;

  const processFigureNode = (node: unknown) => {
    const f = node as Record<string, unknown>;
    const type = f['@_type'] as string | undefined;
    const isTable = type === 'table';

    const label = extractText(f?.head as string | Record<string, unknown> | undefined) || undefined;
    const caption = extractText(
      f?.figDesc as string | Record<string, unknown> | undefined,
    ) || undefined;

    if (isTable) {
      tblIdx++;
      const id = `t${tblIdx}`;
      const tableEl = f?.table as Record<string, unknown> | undefined;
      const content = tableEl ? extractTableText(tableEl) : undefined;
      tables.push({ id, label, caption, content });
    } else {
      figIdx++;
      const id = `f${figIdx}`;
      figures.push({ id, label, caption });
    }
  };

  // Figures can appear directly in body or nested in divs
  const walkBody = (node: Record<string, unknown>) => {
    asArray(node?.figure).forEach(processFigureNode);
    asArray(node?.div).forEach((d) => walkBody(d as Record<string, unknown>));
  };

  walkBody(body);
  return { figures, tables };
}

function extractTableText(table: Record<string, unknown>): string {
  const rows = asArray(table?.row);
  return rows
    .map((row) => {
      const cells = asArray((row as Record<string, unknown>)?.cell);
      return cells.map((c) => extractText(c as string | Record<string, unknown>)).join('\t');
    })
    .join('\n');
}

// ---- Quality inference -------------------------------------------------------

function inferQuality(sections: Section[], references: Reference[]): ExtractionQuality {
  const totalParagraphs = countParagraphs(sections);
  if (sections.length === 0 && references.length === 0) return 'metadata-only';
  if (totalParagraphs < 3) return 'partial';
  return 'full';
}

function countParagraphs(sections: Section[]): number {
  return sections.reduce(
    (sum, s) => sum + s.paragraphs.length + countParagraphs(s.children),
    0,
  );
}

// ---- Helpers -----------------------------------------------------------------

function extractText(node: string | Record<string, unknown> | undefined | null): string {
  if (node === undefined || node === null) return '';
  if (typeof node === 'string') return node.trim();
  if (typeof node === 'number') return String(node);
  const raw = node['#text'] ?? node['_'] ?? '';
  return String(raw).trim();
}

function asArray(val: unknown): unknown[] {
  if (!val) return [];
  return Array.isArray(val) ? val : [val];
}
