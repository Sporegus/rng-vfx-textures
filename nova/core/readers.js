// Reading your own files: text, Markdown, CSV, JSON, Word (.docx), Excel (.xlsx) and
// PDF. The text goes to a model (as data, never as instructions) if one is set up;
// numbers in tables are computed here, exactly, never estimated by a model.
// PDF text is extracted best-effort: a scanned PDF (only images) has no text to read,
// and she says so instead of guessing.
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { unzip, parseCsv } = require('./content');
const { NovaError } = require('./util');

const MAX_BYTES = 30 * 1024 * 1024;
const xmlText = (s) => String(s).replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

function readDocx(buf) {
  const z = unzip(buf);
  const doc = (z['word/document.xml'] || Buffer.from('')).toString('utf8');
  const paras = [...doc.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)].map(m => [...m[0].matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map(t => xmlText(t[1])).join('')).filter(Boolean);
  const tables = [...doc.matchAll(/<w:tbl>[\s\S]*?<\/w:tbl>/g)].map(t => [...t[0].matchAll(/<w:tr[ >][\s\S]*?<\/w:tr>/g)].map(r => [...r[0].matchAll(/<w:tc>[\s\S]*?<\/w:tc>/g)].map(c => [...c[0].matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map(x => xmlText(x[1])).join(''))));
  return { kind: 'Word document', text: paras.join('\n'), tables };
}
function readXlsx(buf) {
  const z = unzip(buf);
  const shared = [...(z['xl/sharedStrings.xml'] || Buffer.from('')).toString('utf8').matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(t => xmlText(t[1])).join(''));
  const names = [...(z['xl/workbook.xml'] || Buffer.from('')).toString('utf8').matchAll(/<sheet [^>]*name="([^"]*)"/g)].map(m => xmlText(m[1]));
  const sheets = Object.keys(z).filter(n => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
  const colIdx = (ref) => { const l = ref.match(/^[A-Z]+/)[0]; let n = 0; for (const ch of l) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
  const tables = [], formulas = [];
  sheets.forEach((s, si) => {
    const rows = [];
    for (const r of z[s].toString('utf8').matchAll(/<row [^>]*?r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
      const row = [];
      for (const c of r[2].matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const ref = (c[1].match(/r="([A-Z]+\d+)"/) || [])[1]; if (!ref) continue;
        const type = (c[1].match(/t="(\w+)"/) || [])[1], body = c[2] || '';
        const f = (body.match(/<f>([\s\S]*?)<\/f>/) || [])[1], v = (body.match(/<v>([\s\S]*?)<\/v>/) || [])[1], is = (body.match(/<t[^>]*>([\s\S]*?)<\/t>/) || [])[1];
        let val = type === 's' ? shared[Number(v)] : type === 'inlineStr' ? xmlText(is || '') : v != null ? (isNaN(Number(v)) ? xmlText(v) : Number(v)) : '';
        if (f) { formulas.push({ sheet: names[si] || `Sheet${si + 1}`, cell: ref, formula: xmlText(f), cached: v != null ? val : null }); if (v == null) val = `=${xmlText(f)}`; }
        row[colIdx(ref)] = val;
      }
      rows[Number(r[1]) - 1] = Array.from(row, x => x === undefined ? '' : x);
    }
    tables.push({ name: names[si] || `Sheet${si + 1}`, rows: Array.from(rows, x => x || []) });
  });
  return { kind: 'Excel workbook', text: tables.map(t => `# ${t.name}\n` + t.rows.slice(0, 200).map(r => r.join('\t')).join('\n')).join('\n\n'), tables: tables.map(t => t.rows), sheetNames: tables.map(t => t.name), formulas };
}
// ASCII85 (used by some PDF writers before compression)
function a85(buf) {
  const s = buf.toString('latin1').replace(/\s+/g, '').replace(/^<~/, '').replace(/~>.*$/, '');
  const out = [];
  let i = 0;
  while (i < s.length) {
    if (s[i] === 'z') { out.push(0, 0, 0, 0); i++; continue; }
    const chunk = s.slice(i, i + 5); i += 5;
    const pad = 5 - chunk.length, full = chunk + 'u'.repeat(pad);
    let n = 0; for (const ch of full) n = n * 85 + (ch.charCodeAt(0) - 33);
    const bytes = [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
    out.push(...bytes.slice(0, 4 - pad));
  }
  return Buffer.from(out);
}
// PDF: decompress content streams and pull the strings shown by text operators
function readPdf(buf) {
  const s = buf.toString('latin1');
  if (!s.startsWith('%PDF-')) throw new NovaError('invalid', 'That isn\'t a PDF.');
  if (/\/Encrypt\b/.test(s)) return { kind: 'PDF', text: '', note: 'This PDF is encrypted, so I can\'t read its text.' };
  const out = [];
  // each stream's own dictionary is between its "N 0 obj" and the word "stream"
  for (const m of s.matchAll(/\bstream\r?\n/g)) {
    const objStart = s.lastIndexOf(' obj', m.index);
    if (objStart < 0) continue;
    const dict = s.slice(objStart, m.index), start = m.index + m[0].length;
    const end = s.indexOf('endstream', start); if (end < 0) continue;
    let data = Buffer.from(s.slice(start, end), 'latin1');
    const filters = (dict.match(/\/Filter\s*(\[[^\]]*\]|\/\w+)/) || [])[1] || '';
    let ok = true;
    for (const f of filters.match(/\/\w+/g) || []) {
      if (f === '/ASCII85Decode' || f === '/A85') data = a85(data);
      else if (f === '/FlateDecode' || f === '/Fl') { try { data = zlib.inflateSync(data); } catch { try { data = zlib.inflateRawSync(data.subarray(2)); } catch { ok = false; } } }
      else ok = false;   // images and other encodings: not text
    }
    if (!ok) continue;
    const c = data.toString('latin1');
    if (!/\b(Tj|TJ|')\b|\bT[Jj]\b/.test(c)) continue;
    const lit = (str) => str.replace(/\\([nrtbf()\\]|\d{1,3})/g, (_, e) => ({ n: '\n', r: '', t: '\t', b: '', f: '', '(': '(', ')': ')', '\\': '\\' }[e] ?? String.fromCharCode(parseInt(e, 8))));
    for (const op of c.matchAll(/\[((?:[^\]\\]|\\.)*)\]\s*TJ|\(((?:[^()\\]|\\.)*)\)\s*(?:Tj|')|(T\*|Td|TD|ET)/g)) {
      if (op[3]) { out.push('\n'); continue; }
      if (op[2] != null) out.push(lit(op[2]));
      else out.push([...op[1].matchAll(/\(((?:[^()\\]|\\.)*)\)|(-?\d+(?:\.\d+)?)/g)].map(p => p[1] != null ? lit(p[1]) : Number(p[2]) < -200 ? ' ' : '').join(''));
    }
  }
  const text = out.join('').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  const pages = Number((s.match(/\/Type\s*\/Pages[\s\S]*?\/Count\s+(\d+)/) || [])[1]) || null;
  return { kind: 'PDF', text, pages, note: text ? null : 'I couldn\'t find any text in this PDF. It\'s probably scanned (only images); reading it would need OCR.' };
}

function read(file) {
  if (!file || !fs.existsSync(file)) throw new NovaError('not_found', 'I can\'t find that file.');
  const st = fs.statSync(file);
  if (!st.isFile()) throw new NovaError('invalid', 'That\'s a folder, not a file.');
  if (st.size > MAX_BYTES) throw new NovaError('invalid', 'That file is over 30 MB; too big to read here.');
  const ext = path.extname(file).toLowerCase(), buf = fs.readFileSync(file);
  let r;
  if (ext === '.docx') r = readDocx(buf);
  else if (ext === '.xlsx') r = readXlsx(buf);
  else if (ext === '.pdf') r = readPdf(buf);
  else if (ext === '.csv') { const rows = parseCsv(buf.toString('utf8')); r = { kind: 'CSV table', text: rows.slice(0, 300).map(x => x.join('\t')).join('\n'), tables: [rows] }; }
  else if (['.txt', '.md', '.json', '.log', '.js', '.ts', '.py', '.lua', '.luau', '.html', '.css', '.xml', '.yml', '.yaml', '.ini', '.cfg'].includes(ext)) r = { kind: 'text file', text: buf.toString('utf8') };
  else throw new NovaError('invalid', `I can read Word, Excel, PDF, CSV and text files, not ${ext || 'that'} files.`);
  return { file, name: path.basename(file), bytes: st.size, words: (r.text.match(/\S+/g) || []).length, ...r };
}

// exact numbers for each table: rows, columns, and totals/averages of numeric columns
function tableFacts(rows) {
  if (!rows || rows.length < 2) return null;
  const header = rows[0].map(String), body = rows.slice(1).filter(r => r.some(c => c !== '' && c != null));
  const cols = header.map((h, i) => {
    const nums = body.map(r => typeof r[i] === 'number' ? r[i] : (/^-?\d+(\.\d+)?$/.test(String(r[i] ?? '').trim()) ? Number(r[i]) : null)).filter(v => v != null);
    if (nums.length < Math.max(1, body.length * 0.6)) return null;
    const sum = nums.reduce((a, b) => a + b, 0);
    return { column: h || `Column ${i + 1}`, count: nums.length, sum: +sum.toFixed(6), average: +(sum / nums.length).toFixed(6), min: Math.min(...nums), max: Math.max(...nums) };
  }).filter(Boolean);
  return { rows: body.length, columns: header.length, header, numeric: cols };
}

module.exports = { read, tableFacts, readDocx, readXlsx, readPdf };
