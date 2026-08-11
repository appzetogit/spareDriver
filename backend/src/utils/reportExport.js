import PDFDocument from 'pdfkit';
import { drawBrandLogo } from './pdfBrand.js';

const EXPORT_ROW_LIMIT = 10000;

const PALETTE = {
  text: '#0f172a',
  muted: '#64748b',
  border: '#e2e8f0',
  accent: '#0f766e',
  headerBg: '#0f766e',
  rowAlt: '#f8fafc',
  section: '#115e59',
};

export function csvEscape(value) {
  const str = value == null ? '' : String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function xmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function cellToString(value) {
  if (value == null) return '';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function formatDisplayCell(value) {
  if (value == null || value === '') return '—';
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value.toLocaleString('en-IN', {
      maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
    });
  }
  return String(value);
}

function contentWidth(doc) {
  return doc.page.width - doc.page.margins.left - doc.page.margins.right;
}

function contentBottom(doc) {
  return doc.page.height - doc.page.margins.bottom - 24;
}

function ensureSpace(doc, needed) {
  if (doc.y + needed > contentBottom(doc)) {
    doc.addPage();
  }
}

/**
 * Flatten a report document into CSV (Excel-friendly, UTF-8 BOM).
 */
export function documentToCsv(doc) {
  const lines = [];
  if (doc.title) lines.push(csvEscape(doc.title));
  if (doc.meta?.length) {
    for (const item of doc.meta) {
      lines.push([csvEscape(item.label), csvEscape(item.value)].join(','));
    }
    lines.push('');
  }

  for (const section of doc.sections || []) {
    if (section.title) lines.push(csvEscape(section.title));
    if (section.kind === 'kv') {
      for (const [label, value] of section.rows || []) {
        lines.push([csvEscape(label), csvEscape(value)].join(','));
      }
    } else if (section.kind === 'table') {
      if (section.headers?.length) {
        lines.push(section.headers.map(csvEscape).join(','));
      }
      for (const row of section.rows || []) {
        lines.push(row.map((c) => csvEscape(cellToString(c))).join(','));
      }
    }
    lines.push('');
  }

  return `\uFEFF${lines.join('\n')}`;
}

function excelColumnWidth(headers = [], rows = [], colIndex) {
  let maxLen = String(headers[colIndex] ?? '').length;
  const sample = rows.slice(0, 80);
  for (const row of sample) {
    const len = cellToString(row?.[colIndex]).length;
    if (len > maxLen) maxLen = len;
  }
  // SpreadsheetML Column width is roughly character units
  return Math.min(48, Math.max(10, maxLen + 2));
}

function buildExcelSheet(name, rowsXml, columnCount, colWidths) {
  const cols = [];
  for (let i = 0; i < columnCount; i += 1) {
    const w = colWidths?.[i] ?? 18;
    cols.push(`<Column ss:Index="${i + 1}" ss:AutoFitWidth="0" ss:Width="${w}"/>`);
  }
  const safeName = xmlEscape(String(name || 'Sheet').slice(0, 31).replace(/[\\/*?:\[\]]/g, '-'));
  return (
    `<Worksheet ss:Name="${safeName}">` +
    `<Table>${cols.join('')}${rowsXml}</Table>` +
    `</Worksheet>`
  );
}

function excelDataCell(value, { styleId } = {}) {
  const num = typeof value === 'number' && Number.isFinite(value);
  const style = styleId ? ` ss:StyleID="${styleId}"` : '';
  return (
    `<Cell${style}><Data ss:Type="${num ? 'Number' : 'String'}">${xmlEscape(cellToString(value))}</Data></Cell>`
  );
}

/**
 * SpreadsheetML workbook — one sheet for summary/KV, one sheet per table.
 */
export function documentToExcelXml(doc) {
  const sheets = [];
  const summaryRows = [];

  summaryRows.push(
    `<Row ss:Height="22"><Cell ss:StyleID="Title"><Data ss:Type="String">${xmlEscape(doc.title || 'Report')}</Data></Cell></Row>`,
  );
  for (const item of doc.meta || []) {
    summaryRows.push(
      `<Row>${excelDataCell(item.label, { styleId: 'Muted' })}${excelDataCell(item.value)}</Row>`,
    );
  }
  summaryRows.push('<Row></Row>');

  for (const section of doc.sections || []) {
    if (section.kind === 'kv') {
      summaryRows.push(
        `<Row><Cell ss:StyleID="Section"><Data ss:Type="String">${xmlEscape(section.title || 'Summary')}</Data></Cell></Row>`,
      );
      for (const [label, value] of section.rows || []) {
        summaryRows.push(
          `<Row>${excelDataCell(label)}${excelDataCell(value)}</Row>`,
        );
      }
      summaryRows.push('<Row></Row>');
    }
  }

  sheets.push(
    buildExcelSheet('Summary', summaryRows.join(''), 2, [32, 28]),
  );

  let sheetIndex = 1;
  const usedNames = new Set(['summary']);
  for (const section of doc.sections || []) {
    if (section.kind !== 'table') continue;
    const headers = section.headers || [];
    const rows = section.rows || [];
    const colCount = Math.max(headers.length, 1);
    const colWidths = Array.from({ length: colCount }, (_, i) =>
      excelColumnWidth(headers, rows, i),
    );

    const tableRows = [];
    tableRows.push(
      `<Row><Cell ss:StyleID="Section"><Data ss:Type="String">${xmlEscape(section.title || `Table ${sheetIndex}`)}</Data></Cell></Row>`,
    );
    tableRows.push('<Row></Row>');
    if (headers.length) {
      tableRows.push(
        `<Row ss:Height="18">${headers.map((h) => excelDataCell(h, { styleId: 'Header' })).join('')}</Row>`,
      );
    }
    for (const row of rows) {
      const cells = [];
      for (let i = 0; i < colCount; i += 1) {
        cells.push(excelDataCell(row[i] ?? ''));
      }
      tableRows.push(`<Row>${cells.join('')}</Row>`);
    }

    let rawName = String(section.title || `Table ${sheetIndex}`)
      .replace(/[\\/*?:\[\]]/g, '-')
      .slice(0, 28);
    let unique = rawName;
    let n = 2;
    while (usedNames.has(unique.toLowerCase())) {
      unique = `${rawName.slice(0, 28)} ${n}`;
      n += 1;
    }
    usedNames.add(unique.toLowerCase());
    sheets.push(buildExcelSheet(unique, tableRows.join(''), colCount, colWidths));
    sheetIndex += 1;
  }

  return (
    `<?xml version="1.0"?>\n` +
    `<?mso-application progid="Excel.Sheet"?>\n` +
    `<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"\n` +
    ` xmlns:o="urn:schemas-microsoft-com:office:office"\n` +
    ` xmlns:x="urn:schemas-microsoft-com:office:excel"\n` +
    ` xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">\n` +
    `<Styles>\n` +
    `  <Style ss:ID="Title"><Font ss:Bold="1" ss:Size="14" ss:Color="#0F172A"/></Style>\n` +
    `  <Style ss:ID="Section"><Font ss:Bold="1" ss:Size="11" ss:Color="#0F766E"/></Style>\n` +
    `  <Style ss:ID="Header"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#0F766E" ss:Pattern="Solid"/><Alignment ss:Horizontal="Left" ss:Vertical="Center" ss:WrapText="1"/></Style>\n` +
    `  <Style ss:ID="Muted"><Font ss:Color="#64748B"/></Style>\n` +
    `  <Style ss:ID="Default"><Alignment ss:Vertical="Center" ss:WrapText="1"/></Style>\n` +
    `</Styles>\n` +
    `${sheets.join('\n')}\n` +
    `</Workbook>`
  );
}

function drawPdfHeader(doc, title) {
  const left = doc.page.margins.left;
  const logo = drawBrandLogo(doc, { x: left, y: doc.page.margins.top, height: 22 });
  const titleX = logo.drawn ? left + logo.width + 10 : left;
  const titleW = contentWidth(doc) - (logo.drawn ? logo.width + 10 : 0);

  doc
    .font('Helvetica-Bold')
    .fontSize(14)
    .fillColor(PALETTE.text)
    .text(title || 'Report', titleX, doc.page.margins.top + 2, {
      width: titleW,
      lineBreak: false,
      ellipsis: true,
    });

  const headerBottom = Math.max(
    doc.page.margins.top + (logo.drawn ? logo.height : 18),
    doc.page.margins.top + 20,
  );
  doc.y = headerBottom + 8;

  doc
    .moveTo(left, doc.y)
    .lineTo(left + contentWidth(doc), doc.y)
    .lineWidth(0.8)
    .strokeColor(PALETTE.border)
    .stroke();
  doc.y += 12;
}

function drawPdfMeta(doc, meta = []) {
  if (!meta.length) return;
  const left = doc.page.margins.left;
  const width = contentWidth(doc);

  doc.font('Helvetica').fontSize(8).fillColor(PALETTE.muted);
  for (const item of meta) {
    ensureSpace(doc, 14);
    doc.text(`${item.label}: ${item.value}`, left, doc.y, {
      width,
      lineBreak: false,
      ellipsis: true,
    });
    doc.y += 12;
  }
  doc.y += 6;
}

function drawPdfSectionTitle(doc, title) {
  ensureSpace(doc, 36);
  const left = doc.page.margins.left;
  doc
    .font('Helvetica-Bold')
    .fontSize(10)
    .fillColor(PALETTE.section)
    .text(String(title || '').toUpperCase(), left, doc.y, {
      width: contentWidth(doc),
      characterSpacing: 0.4,
    });
  doc.y += 4;
  doc
    .moveTo(left, doc.y)
    .lineTo(left + contentWidth(doc), doc.y)
    .lineWidth(0.5)
    .strokeColor(PALETTE.border)
    .stroke();
  doc.y += 10;
}

function drawPdfKvSection(doc, section) {
  drawPdfSectionTitle(doc, section.title || 'Summary');
  const left = doc.page.margins.left;
  const gap = 16;
  const colW = (contentWidth(doc) - gap) / 2;
  const pairs = section.rows || [];

  for (let i = 0; i < pairs.length; i += 2) {
    ensureSpace(doc, 28);
    const y = doc.y;

    const drawPair = (pair, x) => {
      if (!pair) return 0;
      const [label, value] = pair;
      doc
        .font('Helvetica')
        .fontSize(7.5)
        .fillColor(PALETTE.muted)
        .text(String(label).toUpperCase(), x, y, {
          width: colW,
          lineBreak: false,
          ellipsis: true,
        });
      doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor(PALETTE.text)
        .text(formatDisplayCell(value), x, y + 11, {
          width: colW,
          lineBreak: false,
          ellipsis: true,
        });
      return 26;
    };

    const h1 = drawPair(pairs[i], left);
    const h2 = drawPair(pairs[i + 1], left + colW + gap);
    doc.y = y + Math.max(h1, h2);
  }
  doc.y += 8;
}

function estimateColWidths(headers, rows, totalWidth) {
  const colCount = Math.max(headers.length, 1);
  const weights = [];
  for (let i = 0; i < colCount; i += 1) {
    let max = String(headers[i] || '').length;
    for (const row of rows.slice(0, 40)) {
      max = Math.max(max, cellToString(row?.[i]).length);
    }
    // Cap so one wide column doesn't crush others
    weights.push(Math.min(28, Math.max(6, max)));
  }
  const sum = weights.reduce((a, b) => a + b, 0) || colCount;
  return weights.map((w) => (w / sum) * totalWidth);
}

function drawPdfTableSection(doc, section, { isLast = false } = {}) {
  const headers = section.headers || [];
  const allRows = section.rows || [];
  const maxRows = Math.min(allRows.length, 250);
  const rows = allRows.slice(0, maxRows);
  const colCount = Math.max(headers.length, ...rows.map((r) => r.length), 1);

  const needsLandscape = colCount >= 6;
  let switchedToLandscape = false;
  if (needsLandscape) {
    doc.addPage({ size: 'A4', layout: 'landscape', margin: 36 });
    switchedToLandscape = true;
  } else {
    ensureSpace(doc, 48);
  }

  drawPdfSectionTitle(doc, section.title || 'Data');

  const left = doc.page.margins.left;
  const tableW = contentWidth(doc);
  const widths = estimateColWidths(
    headers.length ? headers : Array.from({ length: colCount }, (_, i) => `Col ${i + 1}`),
    rows,
    tableW,
  );
  const headerH = 22;
  const rowH = 18;
  const fontSize = colCount >= 8 ? 6.5 : colCount >= 6 ? 7 : 8;

  const drawHeader = () => {
    ensureSpace(doc, headerH + rowH);
    let y = doc.y;
    doc.rect(left, y, tableW, headerH).fillColor(PALETTE.headerBg).fill();
    let x = left;
    for (let i = 0; i < colCount; i += 1) {
      doc
        .font('Helvetica-Bold')
        .fontSize(fontSize)
        .fillColor('#FFFFFF')
        .text(String(headers[i] ?? ''), x + 4, y + 6, {
          width: widths[i] - 8,
          lineBreak: false,
          ellipsis: true,
        });
      x += widths[i];
    }
    doc.y = y + headerH;
  };

  drawHeader();

  if (!rows.length) {
    ensureSpace(doc, rowH);
    const y = doc.y;
    doc.rect(left, y, tableW, rowH).fillColor(PALETTE.rowAlt).fill();
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor(PALETTE.muted)
      .text('No rows', left + 6, y + 5, { width: tableW - 12 });
    doc.y = y + rowH + 10;
  } else {
    rows.forEach((row, rowIdx) => {
      if (doc.y + rowH > contentBottom(doc)) {
        doc.addPage({
          size: 'A4',
          layout: needsLandscape ? 'landscape' : 'portrait',
          margin: needsLandscape ? 36 : 48,
        });
        drawHeader();
      }

      const y = doc.y;
      const bg = rowIdx % 2 === 0 ? '#FFFFFF' : PALETTE.rowAlt;
      doc.rect(left, y, tableW, rowH).fillColor(bg).fill();
      doc
        .moveTo(left, y + rowH)
        .lineTo(left + tableW, y + rowH)
        .lineWidth(0.25)
        .strokeColor(PALETTE.border)
        .stroke();

      let x = left;
      for (let i = 0; i < colCount; i += 1) {
        doc
          .font('Helvetica')
          .fontSize(fontSize)
          .fillColor(PALETTE.text)
          .text(formatDisplayCell(row[i]), x + 4, y + 5, {
            width: widths[i] - 8,
            lineBreak: false,
            ellipsis: true,
          });
        x += widths[i];
      }
      doc.y = y + rowH;
    });
  }

  if (allRows.length > maxRows) {
    doc.y += 6;
    doc
      .font('Helvetica-Oblique')
      .fontSize(8)
      .fillColor(PALETTE.muted)
      .text(
        `Showing ${maxRows} of ${allRows.length} rows. Download Excel for the full list.`,
        left,
        doc.y,
        { width: tableW },
      );
    doc.y += 14;
  } else {
    doc.y += 12;
  }

  if (switchedToLandscape && !isLast) {
    doc.addPage({ size: 'A4', layout: 'portrait', margin: 48 });
  }
}

function drawPdfFooters(doc) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    const label = `SpareDriver · Page ${i - range.start + 1} of ${range.count}`;
    doc
      .font('Helvetica')
      .fontSize(7.5)
      .fillColor(PALETTE.muted)
      .text(label, doc.page.margins.left, doc.page.height - 28, {
        width: contentWidth(doc),
        align: 'center',
        lineBreak: false,
      });
  }
}

/**
 * Stream a branded multi-section report PDF to `res`.
 */
export function pipeDocumentPdf(res, doc, { filename } = {}) {
  const safeName = filename || `${doc.filename || 'report'}-${Date.now()}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);

  const pdf = new PDFDocument({
    size: 'A4',
    layout: 'portrait',
    margin: 48,
    bufferPages: true,
    autoFirstPage: true,
    info: { Title: doc.title || 'SpareDriver Report', Author: 'SpareDriver Admin' },
  });
  pdf.pipe(res);

  drawPdfHeader(pdf, doc.title);
  drawPdfMeta(pdf, doc.meta);

  const sections = (doc.sections || []).filter((section) => {
    if (section.kind !== 'table') return true;
    const rows = section.rows || [];
    const isSparseTrend =
      /trend/i.test(section.title || '') &&
      rows.length > 14 &&
      rows.filter((r) => Number(r?.[1]) > 0).length < 3;
    return !isSparseTrend;
  });

  sections.forEach((section, index) => {
    const isLast = index === sections.length - 1;
    if (section.kind === 'kv') {
      drawPdfKvSection(pdf, section);
    } else if (section.kind === 'table') {
      drawPdfTableSection(pdf, section, { isLast });
    }
  });

  drawPdfFooters(pdf);
  pdf.end();
}

export function sendSpreadsheet(res, doc, { format = 'excel' } = {}) {
  const stamp = Date.now();
  const base = doc.filename || 'report';

  if (format === 'csv') {
    const csv = documentToCsv(doc);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${base}-${stamp}.csv"`);
    return res.status(200).send(csv);
  }

  const xml = documentToExcelXml(doc);
  res.setHeader('Content-Type', 'application/vnd.ms-excel; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${base}-${stamp}.xls"`);
  return res.status(200).send(xml);
}

export function resolveExportFormat(query = {}) {
  const raw = String(query.format || 'excel').toLowerCase();
  if (raw === 'pdf') return 'pdf';
  if (raw === 'csv') return 'csv';
  return 'excel';
}

export function formatFilterMeta(filters = {}) {
  const meta = [];
  if (filters.periodLabel) meta.push({ label: 'Period', value: filters.periodLabel });
  else if (filters.period) meta.push({ label: 'Period', value: String(filters.period) });
  if (filters.from) meta.push({ label: 'From', value: String(filters.from) });
  if (filters.to) meta.push({ label: 'To', value: String(filters.to) });
  if (filters.generatedAt) {
    meta.push({ label: 'Generated', value: filters.generatedAt });
  } else {
    meta.push({
      label: 'Generated',
      value: new Date().toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
    });
  }
  return meta;
}

export { EXPORT_ROW_LIMIT };
