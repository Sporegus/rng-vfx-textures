// Bundles the sprite lab into one HTML file: node design/build-lab.js [outFile]
const fs = require('fs');
const path = require('path');

const read = (p) => fs.readFileSync(path.join(__dirname, p), 'utf8');
const html = read('lab-shell.html')
  .replace('/*HOLO_JS*/', () => read('holo.js'))
  .replace('/*LAB_JS*/', () => read('lab.js'));

const out = process.argv[2] || path.join(__dirname, 'sprite-lab.html');
fs.writeFileSync(out, html);
console.log('wrote', out, Math.round(html.length / 1024) + ' KB');
