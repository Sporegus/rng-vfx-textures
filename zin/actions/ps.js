// Runs a PowerShell snippet. User-provided values (paths, text) are passed
// through environment variables (ZIN_ARG0, ZIN_ARG1, ...) and never pasted
// into the script, so a weird filename can't turn into a command.
const { execFile, spawn } = require('child_process');

function encode(script) {
  return Buffer.from(script, 'utf16le').toString('base64');
}

function run(script, args = [], timeout = 30000) {
  if (process.platform !== 'win32') return Promise.reject(new Error('This only works on Windows.'));
  const env = { ...process.env };
  args.forEach((a, i) => { env['ZIN_ARG' + i] = String(a); });
  return new Promise((resolve, reject) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encode(script)],
      { env, timeout, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) return reject(new Error((stderr || err.message).toString().trim().split('\n')[0]));
        resolve(stdout.toString().trim());
      });
  });
}

// Long-running script; calls onLine for each line it prints.
function stream(script, onLine) {
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encode(script)], { windowsHide: true });
  let buf = '';
  child.stdout.on('data', (d) => {
    buf += d.toString();
    let i;
    while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (line) onLine(line); }
  });
  child.on('error', () => {});
  return { stop: () => { try { child.kill(); } catch {} } };
}

module.exports = { run, stream };
