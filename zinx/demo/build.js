// Bundles the browser demo into one HTML file: node demo/build.js [outFile]
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
// the demo page sets its own font and colors; keep the app's bubble styles
const appCss = read('src/style.css').replace(/html, body \{[\s\S]*?\}\n/, '');

const html = read('demo/shell.html')
  .replace('/*APP_CSS*/', () => appCss.replace('--font: "Cascadia Mono", Consolas, "Courier New", monospace;', ''))
  .replace('/*SPRITES_JS*/', () => read('src/sprites.js'))
  .replace('/*DEMO_JS*/', () => read('demo/demo.js'))
  .replace('/*RENDERER_JS*/', () => read('src/renderer.js'));

const out = process.argv[2] || path.join(__dirname, 'zinx-demo.html');
fs.writeFileSync(out, html);
console.log('wrote', out, Math.round(html.length / 1024) + ' KB');
