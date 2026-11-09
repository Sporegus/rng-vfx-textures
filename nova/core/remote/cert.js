// A self-signed TLS certificate for the phone dashboard (ECDSA P-256, made with
// Node's own crypto: no extra installs, no outside service). The phone will warn
// that it's self-signed; the pairing screen shows its fingerprint so you can check
// it's really your PC. The private key never leaves Nova's folder.
'use strict';
const crypto = require('crypto');

// ---- tiny DER encoder
const len = (n) => n < 128 ? Buffer.from([n]) : (() => { const b = []; while (n) { b.unshift(n & 255); n >>= 8; } return Buffer.from([0x80 | b.length, ...b]); })();
const tlv = (tag, body) => Buffer.concat([Buffer.from([tag]), len(body.length), body]);
const seq = (...items) => tlv(0x30, Buffer.concat(items));
const set = (...items) => tlv(0x31, Buffer.concat(items));
const int = (buf) => { let b = Buffer.from(buf); while (b.length > 1 && b[0] === 0 && !(b[1] & 0x80)) b = b.subarray(1); if (b[0] & 0x80) b = Buffer.concat([Buffer.from([0]), b]); return tlv(0x02, b); };
const oid = (s) => { const p = s.split('.').map(Number); const out = [40 * p[0] + p[1]]; for (const v of p.slice(2)) { const st = []; let x = v; st.unshift(x & 127); while ((x >>= 7)) st.unshift((x & 127) | 128); out.push(...st); } return tlv(0x06, Buffer.from(out)); };
const utf8 = (s) => tlv(0x0c, Buffer.from(s, 'utf8'));
const time = (d) => { const s = d.toISOString().replace(/[-:T]/g, '').slice(2, 14) + 'Z'; return tlv(0x17, Buffer.from(s)); };   // UTCTime
const bitstr = (b) => tlv(0x03, Buffer.concat([Buffer.from([0]), b]));
const octet = (b) => tlv(0x04, b);
const ctx = (n, b, constructed = true) => tlv((constructed ? 0xa0 : 0x80) | n, b);

function makeCert({ names = ['localhost'], ips = ['127.0.0.1'], days = 825, cn = 'Nova desktop' } = {}) {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const spki = publicKey.export({ type: 'spki', format: 'der' });
  const alg = seq(oid('1.2.840.10045.4.3.2'));                         // ecdsa-with-SHA256
  const name = seq(set(seq(oid('2.5.4.3'), utf8(cn))));
  const now = new Date(Date.now() - 60000), until = new Date(Date.now() + days * 86400e3);
  const san = seq(...names.map(n => ctx(2, Buffer.from(n), false)), ...ips.map(ip => ctx(7, Buffer.from(ip.split('.').map(Number)), false)));
  const exts = ctx(3, seq(
    seq(oid('2.5.29.17'), octet(san)),                                   // subjectAltName
    seq(oid('2.5.29.19'), Buffer.from([0x01, 0x01, 0xff]), octet(seq())),   // basicConstraints (critical): not a CA
    seq(oid('2.5.29.37'), octet(seq(oid('1.3.6.1.5.5.7.3.1')))),        // extendedKeyUsage: serverAuth
  ));
  const tbs = seq(ctx(0, int(Buffer.from([2]))), int(crypto.randomBytes(16)), alg, name, seq(time(now), time(until)), name, spki, exts);
  const sig = crypto.sign('sha256', tbs, privateKey);
  const der = seq(tbs, alg, bitstr(sig));
  const pem = `-----BEGIN CERTIFICATE-----\n${der.toString('base64').match(/.{1,64}/g).join('\n')}\n-----END CERTIFICATE-----\n`;
  const x = new crypto.X509Certificate(pem);   // parses and checks our own work
  if (!x.verify(publicKey)) throw new Error('certificate self-check failed');
  return { cert: pem, key: privateKey.export({ type: 'pkcs8', format: 'pem' }), fingerprint: x.fingerprint256, validTo: x.validTo, names, ips };
}

module.exports = { makeCert };
