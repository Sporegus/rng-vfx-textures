// Reading your own Word/Excel/PDF/CSV files; exact table figures (P2 §9).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path');
const { execFileSync } = require('child_process');
const { createContent } = require('../content');
const readers = require('../readers');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-read-'));
const c = createContent({ dir });
const rows = [['Item', 'Price', 'Qty'], ['Mask', 4.5, 3], ['Armour', 12, 1], ['Boots', 7.25, 2]];

test('Word: paragraphs and tables come back', () => {
  const f = c.write({ title: 'Armour notes', blocks: [{ p: 'Obsidian palette for the chest plate.' }, { table: rows.map(r => r.map(String)) }], format: 'docx' }).file;
  const r = readers.read(f);
  assert.match(r.text, /Obsidian palette/);
  assert.equal(r.tables[0][2][0], 'Armour');
});
test('Excel: values, formulas, and exact totals computed here', () => {
  const f = c.write({ title: 'Prices', rows: [...rows, ['Total', { f: 'SUM(B2:B4)' }, { f: 'SUM(C2:C4)' }]], format: 'xlsx' }).file;
  const r = readers.read(f);
  assert.equal(r.tables[0][1][1], 4.5);
  assert.ok(r.formulas.some(x => x.cell === 'B5' && x.formula === 'SUM(B2:B4)'));
  const facts = readers.tableFacts(r.tables[0].slice(0, 4));
  assert.deepEqual(facts.numeric.find(x => x.column === 'Price'), { column: 'Price', count: 3, sum: 23.75, average: 7.916667, min: 4.5, max: 12 });
});
test('PDF: text extracted (also from a compressed PDF made by another tool, if available)', () => {
  const f = c.write({ title: 'Report', blocks: [{ p: 'The parry window is six frames.' }], format: 'pdf' }).file;
  const r = readers.read(f);
  assert.match(r.text, /parry window is six frames/);
  let made = false;
  try { execFileSync('python3', ['-c', 'import sys\nfrom reportlab.pdfgen import canvas\nc=canvas.Canvas(sys.argv[1]); c.drawString(72,720,"Compressed hello from reportlab"); c.save()', path.join(dir, 'rl.pdf')], { stdio: 'ignore' }); made = true; } catch {}
  if (made) assert.match(readers.read(path.join(dir, 'rl.pdf')).text, /Compressed hello from reportlab/);
});
test('a scanned or unsupported file is reported honestly', () => {
  const img = path.join(dir, 'scan.pdf');
  fs.writeFileSync(img, '%PDF-1.4\n1 0 obj << /Type /XObject /Subtype /Image /Filter /DCTDecode /Length 4 >>\nstream\n\xff\xd8\xff\xd9\nendstream\nendobj\ntrailer << >>\n%%EOF\n', 'latin1');
  assert.match(readers.read(img).note, /scanned/);
  fs.writeFileSync(path.join(dir, 'x.exe'), 'MZ');
  assert.throws(() => readers.read(path.join(dir, 'x.exe')), /can read Word, Excel, PDF/);
});
test('"summarize <file>" without a model: exact facts, no invented summary', async () => {
  const { harness } = require('./harness');
  const { createPipeline } = require('../pipeline');
  const brain = require('../../brain/brain');
  const f = c.write({ title: 'Budget', rows, format: 'csv' }).file;
  const h = harness();
  const p = createPipeline({ tasks: h.tasks, permissions: h.permissions, tools: h.tools, log: h.log, brain, ui: h.ui, page: { run: async () => ({}) }, llm: null, readers, canRead: () => true });
  await p.input({ text: `summarize ${f}` });
  const r = h.replies().join('\n');
  assert.match(r, /3 rows × 3 columns/);
  assert.match(r, /Price: total 23\.75/);
  assert.match(r, /A chat brain would write a real summary/);
  const h2 = harness();
  const p2 = createPipeline({ tasks: h2.tasks, permissions: h2.permissions, tools: h2.tools, log: h2.log, brain, ui: h2.ui, page: { run: async () => ({}) }, llm: null, readers, canRead: () => false });
  await p2.input({ text: `summarize ${f}` });
  assert.ok(h2.replies().some(x => /isn't in a folder you've let Nova read/.test(x)));
});
