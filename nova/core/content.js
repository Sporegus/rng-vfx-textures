// Documents and tables in their real formats, written natively (no extra installs)
// and checked after writing: CSV, XLSX (spreadsheet with numbers and formulas),
// DOCX (headings, paragraphs, a table), PDF (text pages), Markdown, and SVG bar charts.
// Nothing is "plain text renamed as a PDF": every file is re-opened and validated,
// and a file that fails validation is deleted and reported as a failure.
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { NovaError } = require('./util');

// ---------------------------------------------------------------- zip (for xlsx/docx)
const CRC = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
const crc32 = (b) => { let c = -1; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function zip(files) {   // files: [{ name, data: Buffer|string }]
  const parts = [], central = [];
  let off = 0;
  for (const f of files) {
    const name = Buffer.from(f.name), raw = Buffer.isBuffer(f.data) ? f.data : Buffer.from(f.data), comp = zlib.deflateRawSync(raw), crc = crc32(raw);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0, 6); lh.writeUInt16LE(8, 8); lh.writeUInt32LE(0, 10); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(name.length, 26); lh.writeUInt16LE(0, 28);
    parts.push(lh, name, comp);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0, 8); ch.writeUInt16LE(8, 10); ch.writeUInt32LE(0, 12); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(off, 42);
    central.push(ch, name);
    off += 30 + name.length + comp.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, cd, end]);
}
function unzip(buf) {   // -> { name: Buffer }, checking every CRC
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error('not a zip');
  const n = buf.readUInt16LE(eocd + 10), cdOff = buf.readUInt32LE(eocd + 16), out = {};
  let p = cdOff;
  for (let i = 0; i < n; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('bad central directory');
    const method = buf.readUInt16LE(p + 10), crc = buf.readUInt32LE(p + 16), csize = buf.readUInt32LE(p + 20), nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32), lho = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nlen);
    const ln = buf.readUInt16LE(lho + 26), lx = buf.readUInt16LE(lho + 28);
    const data = buf.subarray(lho + 30 + ln + lx, lho + 30 + ln + lx + csize);
    const raw = method === 8 ? zlib.inflateRawSync(data) : data;
    if (crc32(raw) !== crc) throw new Error('CRC mismatch in ' + name);
    out[name] = raw;
    p += 46 + nlen + xlen + clen;
  }
  return out;
}
const xml = (s) => String(s == null ? '' : s).replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
const wellFormed = (s) => { const stack = []; const re = /<(\/?)([A-Za-z_][\w:.-]*)[^>]*?(\/?)>/g; let m; while ((m = re.exec(s))) { if (m[0].startsWith('<?')) continue; if (m[1]) { if (stack.pop() !== m[2]) return false; } else if (!m[3]) stack.push(m[2]); } return stack.length === 0; };

// ---------------------------------------------------------------- formats
function csv(rows) { return rows.map(r => r.map(v => { const s = v == null ? '' : String(v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(',')).join('\r\n') + '\r\n'; }
function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(cell); cell = ''; } else if (c === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
const colName = (i) => { let s = ''; for (i++; i; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + (i - 1) % 26) + s; return s; };
function xlsx(sheets) {   // [{ name, rows: [[value|{f:'SUM(B2:B4)'}]] }]
  const files = [];
  const sheetXml = (rows) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => {
    const ref = colName(ci) + (ri + 1);
    if (v && typeof v === 'object' && v.f) return `<c r="${ref}"><f>${xml(v.f)}</f></c>`;
    if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"><v>${v}</v></c>`;
    return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xml(v)}</t></is></c>`;
  }).join('')}</row>`).join('')}</sheetData></worksheet>`;
  files.push({ name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>` });
  files.push({ name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` });
  files.push({ name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${xml(String(s.name || 'Sheet' + (i + 1)).slice(0, 31).replace(/[\\/?*[\]:]/g, ' '))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets><calcPr fullCalcOnLoad="1"/></workbook>` });
  files.push({ name: 'xl/_rels/workbook.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}</Relationships>` });
  sheets.forEach((s, i) => files.push({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(s.rows) }));
  return zip(files);
}
function docx(blocks) {   // [{ h1|h2|p: text } | { table: [[...]] }]
  const run = (t, b) => `<w:r>${b ? '<w:rPr><w:b/></w:rPr>' : ''}<w:t xml:space="preserve">${xml(t)}</w:t></w:r>`;
  const body = blocks.map(b => {
    if (b.h1 != null) return `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr>${run(b.h1, true)}</w:p>`;
    if (b.h2 != null) return `<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr>${run(b.h2, true)}</w:p>`;
    if (b.table) return `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="0" w:type="auto"/></w:tblPr><w:tblGrid>${(b.table[0] || []).map(() => `<w:gridCol w:w="${Math.floor(9360 / Math.max(1, b.table[0].length))}"/>`).join('')}</w:tblGrid>${b.table.map((r, ri) => `<w:tr>${r.map(c => `<w:tc><w:p>${run(c, ri === 0)}</w:p></w:tc>`).join('')}</w:tr>`).join('')}</w:tbl>`;
    return String(b.p || '').split('\n').map(line => `<w:p>${run(line)}</w:p>`).join('');
  }).join('');
  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
  return zip([
    { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>` },
    { name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>` },
    { name: 'word/_rels/document.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: 'word/styles.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${W}><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:sz w:val="22"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="240" w:after="120"/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:sz w:val="26"/></w:rPr></w:style><w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4"/><w:left w:val="single" w:sz="4"/><w:bottom w:val="single" w:sz="4"/><w:right w:val="single" w:sz="4"/><w:insideH w:val="single" w:sz="4"/><w:insideV w:val="single" w:sz="4"/></w:tblBorders></w:tblPr></w:style></w:styles>` },
    { name: 'word/document.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W}><w:body>${body}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>` },
  ]);
}
// a simple text PDF: Helvetica, wrapped lines, as many pages as needed
function pdf(blocks, { title = 'Document' } = {}) {
  const lines = [];
  const wrap = (t, size, bold) => { const max = Math.floor(470 / (size * 0.5)); for (const para of String(t).split('\n')) { let cur = ''; for (const w of para.split(/\s+/)) { if ((cur + ' ' + w).trim().length > max) { lines.push({ t: cur.trim(), size, bold }); cur = w; } else cur += ' ' + w; } lines.push({ t: cur.trim(), size, bold }); } };
  for (const b of blocks) { if (b.h1 != null) wrap(b.h1, 18, true); else if (b.h2 != null) wrap(b.h2, 14, true); else if (b.table) for (const r of b.table) wrap(r.join('   |   '), 10, false); else wrap(b.p || '', 11, false); lines.push({ t: '', size: 6 }); }
  const pages = []; let y = 0, cur = [];
  for (const l of lines) { const h = l.size * 1.4; if (y + h > 700) { pages.push(cur); cur = []; y = 0; } cur.push({ ...l, y: 760 - y }); y += h; }
  pages.push(cur);
  const esc = (s) => s.replace(/[\\()]/g, '\\$&').replace(/[^\x20-\x7e]/g, '?');   // standard fonts: plain ASCII only
  const objs = [];
  const add = (s) => { objs.push(s); return objs.length; };
  const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'), fontB = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
  const pagesId = objs.length + 1; objs.push(null);
  const kids = [];
  for (const pg of pages) {
    const content = pg.map(l => `BT /${l.bold ? 'F2' : 'F1'} ${l.size} Tf 72 ${l.y.toFixed(1)} Td (${esc(l.t)}) Tj ET`).join('\n');
    const cid = add(`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${font} 0 R /F2 ${fontB} 0 R >> >> /Contents ${cid} 0 R >>`));
  }
  objs[pagesId - 1] = `<< /Type /Pages /Kids [${kids.map(k => k + ' 0 R').join(' ')}] /Count ${kids.length} >>`;
  const info = add(`<< /Title (${esc(title)}) /Producer (Nova) >>`);
  const cat = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  let out = '%PDF-1.4\n';
  const offs = [];
  objs.forEach((o, i) => { offs.push(Buffer.byteLength(out)); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size ${objs.length + 1} /Root ${cat} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}
function markdown(blocks) { return blocks.map(b => b.h1 != null ? `# ${b.h1}` : b.h2 != null ? `## ${b.h2}` : b.table ? [b.table[0], b.table[0].map(() => '---'), ...b.table.slice(1)].map(r => '| ' + r.join(' | ') + ' |').join('\n') : String(b.p || '')).join('\n\n') + '\n'; }
function svgBars(title, data) {   // [{ label, value }]
  const max = Math.max(1, ...data.map(d => d.value)), W = 640, bar = 28, gap = 10, H = 60 + data.length * (bar + gap);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Segoe UI, sans-serif"><title>${xml(title)}</title><rect width="100%" height="100%" fill="#ffffff"/><text x="16" y="30" font-size="18" font-weight="700" fill="#111">${xml(title)}</text>${data.map((d, i) => { const y = 50 + i * (bar + gap), w = Math.round((W - 220) * d.value / max); return `<text x="16" y="${y + 19}" font-size="13" fill="#333">${xml(String(d.label).slice(0, 22))}</text><rect x="180" y="${y}" width="${w}" height="${bar}" fill="#2b74d1"/><text x="${186 + w}" y="${y + 19}" font-size="12" fill="#111">${d.value}</text>`; }).join('')}</svg>`;
}

// ---------------------------------------------------------------- validation (re-open what was written)
function validate(file) {
  const ext = path.extname(file).toLowerCase(), buf = fs.readFileSync(file);
  if (ext === '.csv') { const rows = parseCsv(buf.toString('utf8')); if (!rows.length) throw new Error('empty CSV'); return { rows: rows.length, cols: rows[0].length }; }
  if (ext === '.xlsx') {
    const z = unzip(buf);
    for (const need of ['[Content_Types].xml', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/worksheets/sheet1.xml']) if (!z[need]) throw new Error('missing ' + need);
    for (const [n, d] of Object.entries(z)) if (n.endsWith('.xml') || n.endsWith('.rels')) if (!wellFormed(d.toString('utf8'))) throw new Error('malformed ' + n);
    return { sheets: Object.keys(z).filter(n => /worksheets\/sheet\d+\.xml$/.test(n)).length, rows: (z['xl/worksheets/sheet1.xml'].toString().match(/<row /g) || []).length };
  }
  if (ext === '.docx') {
    const z = unzip(buf);
    for (const need of ['[Content_Types].xml', 'word/document.xml', '_rels/.rels']) if (!z[need]) throw new Error('missing ' + need);
    const d = z['word/document.xml'].toString('utf8');
    if (!wellFormed(d)) throw new Error('malformed document.xml');
    return { paragraphs: (d.match(/<w:p>|<w:p /g) || []).length, tables: (d.match(/<w:tbl>/g) || []).length };
  }
  if (ext === '.pdf') {
    const s = buf.toString('latin1');
    if (!s.startsWith('%PDF-1.') || !/%%EOF\s*$/.test(s)) throw new Error('missing PDF header/trailer');
    const sx = Number((s.match(/startxref\s+(\d+)/) || [])[1]);
    if (s.slice(sx, sx + 4) !== 'xref') throw new Error('startxref doesn\'t point at the xref table');
    const offs = [...s.slice(sx).matchAll(/^(\d{10}) 00000 n $/gm)].map(m => Number(m[1]));
    offs.forEach((o, i) => { if (!s.slice(o).startsWith(`${i + 1} 0 obj`)) throw new Error(`xref entry ${i + 1} is wrong`); });
    return { pages: Number((s.match(/\/Type \/Pages \/Kids \[[^\]]*\] \/Count (\d+)/) || [])[1]) || 0, objects: offs.length };
  }
  if (ext === '.svg') { const t = buf.toString('utf8'); if (!t.startsWith('<svg') || !wellFormed(t)) throw new Error('malformed SVG'); return { bytes: buf.length }; }
  if (ext === '.md' || ext === '.txt') return { chars: buf.length };
  throw new Error('unknown format ' + ext);
}

function createContent({ dir, log }) {
  const FORMATS = { csv: '.csv', xlsx: '.xlsx', spreadsheet: '.xlsx', excel: '.xlsx', docx: '.docx', word: '.docx', pdf: '.pdf', md: '.md', markdown: '.md', svg: '.svg', chart: '.svg' };
  // blocks + format -> a validated file in Nova's documents folder (never overwriting)
  function write({ title, blocks = [], rows = null, chart = null, format }) {
    const ext = FORMATS[String(format || '').toLowerCase()];
    if (!ext) throw new NovaError('invalid', `I can make CSV, Excel (.xlsx), Word (.docx), PDF, Markdown and SVG charts, not "${format}".`);
    fs.mkdirSync(dir, { recursive: true });
    const base = String(title || 'Nova document').replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || 'Nova document';
    let file = path.join(dir, base + ext), n = 2;
    while (fs.existsSync(file)) file = path.join(dir, `${base} (${n++})${ext}`);
    const table = rows || (blocks.find(b => b.table) || {}).table || null;
    let data;
    if (ext === '.csv') { if (!table) throw new NovaError('invalid', 'A CSV needs a table.'); data = csv(table); }
    else if (ext === '.xlsx') { if (!table) throw new NovaError('invalid', 'A spreadsheet needs a table.'); data = xlsx([{ name: base.slice(0, 31), rows: table }]); }
    else if (ext === '.docx') data = docx([{ h1: title }, ...blocks]);
    else if (ext === '.pdf') data = pdf([{ h1: title }, ...blocks], { title });
    else if (ext === '.md') data = markdown([{ h1: title }, ...blocks]);
    else if (ext === '.svg') { if (!chart) throw new NovaError('invalid', 'A chart needs labels and numbers.'); data = svgBars(title, chart); }
    fs.writeFileSync(file, data, { flag: 'wx' });
    try { const v = validate(file); log && log.event('content.written', { format: ext, bytes: fs.statSync(file).size, ...v }); return { file, format: ext.slice(1), check: v }; }
    catch (e) { fs.rmSync(file, { force: true }); throw new NovaError('failed', `The ${ext.slice(1).toUpperCase()} didn't pass its check (${e.message}), so I deleted it.`); }
  }
  return { write, validate, FORMATS };
}

module.exports = { createContent, zip, unzip, csv, parseCsv, xlsx, docx, pdf, markdown, svgBars, validate };
