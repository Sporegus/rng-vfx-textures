// Real file formats, re-opened and validated (P2 #13). Python's openpyxl/python-docx/pypdf
// cross-check runs too when available (dev machines), as independent evidence.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path');
const { execFileSync } = require('child_process');
const { createContent, parseCsv, validate } = require('../content');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-docs-'));
const c = createContent({ dir });
const table = [['Item', 'Price', 'Qty'], ['Mask', 4.5, 3], ['Armour, "heavy"', 12, 1], ['Total', { f: 'SUM(B2:B3)' }, { f: 'SUM(C2:C3)' }]];
const blocks = [{ h2: 'Summary' }, { p: 'Line one.\nLine two with ünïcödé.' }, { table: table.slice(0, 3).map(r => r.map(String)) }, { p: 'Lorem '.repeat(900) }];

let py = false;
try { execFileSync('python3', ['-c', 'import openpyxl, docx, pypdf'], { stdio: 'ignore' }); py = true; } catch {}
const pycheck = (code, file) => execFileSync('python3', ['-c', code, file]).toString().trim();

test('CSV round-trips quotes, commas and numbers', () => {
  const r = c.write({ title: 'Prices', rows: table.map(r => r.map(v => (v && v.f) ? '' : v)), format: 'csv' });
  const back = parseCsv(fs.readFileSync(r.file, 'utf8'));
  assert.equal(back[2][0], 'Armour, "heavy"');
  assert.equal(back.length, 4);
});
test('XLSX is a valid workbook with numbers and formulas', () => {
  const r = c.write({ title: 'Prices', rows: table, format: 'excel' });
  assert.equal(r.check.rows, 4);
  if (py) assert.equal(pycheck('import openpyxl,sys; ws=openpyxl.load_workbook(sys.argv[1]).active; print(ws["B2"].value, ws["B4"].value, ws["A3"].value)', r.file), '4.5 =SUM(B2:B3) Armour, "heavy"');
});
test('DOCX opens with headings, paragraphs and a table', () => {
  const r = c.write({ title: 'Armour notes', blocks, format: 'word' });
  assert.ok(r.check.tables === 1 && r.check.paragraphs > 3);
  if (py) assert.match(pycheck('import docx,sys; d=docx.Document(sys.argv[1]); print(d.paragraphs[0].text, "|", len(d.tables), "|", d.tables[0].cell(1,0).text)', r.file), /^Armour notes \| 1 \| Mask$/);
});
test('PDF has a correct xref table and spans pages for long text', () => {
  const r = c.write({ title: 'Report', blocks, format: 'pdf' });
  assert.ok(r.check.pages >= 2, 'long text wrapped onto more pages');
  if (py) assert.match(pycheck('import pypdf,sys; r=pypdf.PdfReader(sys.argv[1]); print(len(r.pages), r.pages[0].extract_text()[:6])', r.file), /^\d+ Report/);
});
test('SVG chart and Markdown; never overwrites; a broken file is caught', () => {
  const s = c.write({ title: 'Coins per run', chart: [{ label: 'Run 1', value: 5 }, { label: 'Run 2', value: 3 }], format: 'chart' });
  assert.ok(s.check.bytes > 200);
  const a = c.write({ title: 'Notes', blocks, format: 'md' }), b = c.write({ title: 'Notes', blocks, format: 'md' });
  assert.notEqual(a.file, b.file);
  const fake = path.join(dir, 'fake.pdf'); fs.writeFileSync(fake, 'just text renamed');
  assert.throws(() => validate(fake), /header/);
  assert.throws(() => c.write({ title: 'x', format: 'pptx' }), /can make CSV/);
});

test('"save that as a PDF" uses the last full answer; a new spreadsheet comes from the model and is validated', async () => {
  const { harness } = require('./harness');
  const { createPipeline } = require('../pipeline');
  const brain = require('../../brain/brain');
  const llm = require('../llm');
  const m = llm.mock(['Rust is a systems language.\n\nIt has no garbage collector.', JSON.stringify({ title: 'Planets', rows: [['Planet', 'Moons'], ['Earth', 1], ['Mars', 2]] })]);
  const h = harness({ llm: m, chooseWith: () => 'no' });
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-docs2-'));
  const p = createPipeline({ tasks: h.tasks, permissions: h.permissions, tools: h.tools, log: h.log, brain, ui: h.ui, page: { run: async () => ({}) }, llm: llm.chooser({ mock: m }, ['mock']), content: createContent({ dir: out }), openFile: async () => {} });
  await p.input({ text: 'what is rust?' });
  await p.input({ text: 'save that as a pdf' });
  const pdfFile = fs.readdirSync(out).find(f => f.endsWith('.pdf'));
  assert.ok(pdfFile && validate(path.join(out, pdfFile)).pages >= 1);
  await p.input({ text: 'make me a spreadsheet of planets and their moons' });
  const x = fs.readdirSync(out).find(f => f.endsWith('.xlsx'));
  assert.equal(validate(path.join(out, x)).rows, 3);
  const h2 = harness();
  const p2 = createPipeline({ tasks: h2.tasks, permissions: h2.permissions, tools: h2.tools, log: h2.log, brain, ui: h2.ui, page: { run: async () => ({}) }, llm: null, content: createContent({ dir: out }) });
  await p2.input({ text: 'make me a spreadsheet of planets' });
  assert.ok(h2.replies().some(r => /needs a chat brain/.test(r)), 'no fake document without a writer');
});
