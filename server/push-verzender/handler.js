/**
 * WaasUp – push-verzender (Scaleway Serverless Functions, Parijs)
 *
 * Verstuurt pushmeldingen naar de WaasUp-app op de gsm's van vrienden.
 * Bewaart zelf niets: de vrienden-server (Google Apps Script) geeft per keer
 * de toestellen en de melding mee. Geen extra pakketten nodig (enkel Node zelf).
 *
 *   GET  /sleutel   -> publieke sleutel die de app nodig heeft om meldingen aan te zetten
 *   POST /verstuur  -> melding versturen (enkel met het geheim van WaasUp)
 *
 * Instelling (geheime omgevingsvariabele in Scaleway): WAASUP_GEHEIM
 * Uit dat geheim maakt deze functie zelf de sleutels (VAPID), zodat er maar één geheim is.
 */
'use strict';
const crypto = require('crypto');

const CONTACT = 'mailto:info@waasup.be';
const TOEGELATEN = /^https:\/\/([a-z0-9-]+\.)*(fcm\.googleapis\.com|push\.apple\.com|push\.services\.mozilla\.com|notify\.windows\.com|wns2-[a-z0-9-]+\.notify\.windows\.com)\//i;
const SITE = 'https://waasup.be';
const HERKOMST = ['https://waasup.be', 'https://www.waasup.be'];
let herkomst = SITE;

function b64u(buf) { return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function vanB64u(s) { return Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64'); }
function hmac(sleutel, data) { return crypto.createHmac('sha256', sleutel).update(data).digest(); }

// ---------- Sleutels (VAPID) uit het geheim ----------
let sleutels = null;
function vapid() {
  if (sleutels) return sleutels;
  const geheim = process.env.WAASUP_GEHEIM || '';
  if (geheim.length < 24) throw new Error('geen-geheim');
  const d = hmac(geheim, 'waasup-vapid-v1');
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.setPrivateKey(d);
  const pub = ecdh.getPublicKey(); // 65 bytes: 0x04 | x | y
  const priv = crypto.createPrivateKey({ key: { kty: 'EC', crv: 'P-256', d: b64u(d), x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) }, format: 'jwk' });
  sleutels = { publiek: b64u(pub), prive: priv };
  return sleutels;
}

function jwt(aud) {
  const kop = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const inhoud = b64u(JSON.stringify({ aud: aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: CONTACT }));
  const handtekening = crypto.sign('sha256', Buffer.from(kop + '.' + inhoud), { key: vapid().prive, dsaEncoding: 'ieee-p1363' });
  return kop + '.' + inhoud + '.' + b64u(handtekening);
}

// ---------- Versleuteling (RFC 8291, aes128gcm) ----------
function versleutel(tekst, p256dh, auth) {
  const uaPub = vanB64u(p256dh), authGeheim = vanB64u(auth);
  if (uaPub.length !== 65 || authGeheim.length < 16) throw new Error('sleutels');
  const ecdh = crypto.createECDH('prime256v1'); ecdh.generateKeys();
  const asPub = ecdh.getPublicKey();
  const gedeeld = ecdh.computeSecret(uaPub);
  const prkKey = hmac(authGeheim, gedeeld);
  const ikm = hmac(prkKey, Buffer.concat([Buffer.from('WebPush: info\0'), uaPub, asPub, Buffer.from([1])])).subarray(0, 32);
  const zout = crypto.randomBytes(16);
  const prk = hmac(zout, ikm);
  const cek = hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01', 'binary')).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01', 'binary')).subarray(0, 12);
  const c = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const geheim = Buffer.concat([c.update(Buffer.concat([Buffer.from(tekst, 'utf8'), Buffer.from([2])])), c.final(), c.getAuthTag()]);
  const kop = Buffer.alloc(21); zout.copy(kop, 0); kop.writeUInt32BE(4096, 16); kop[20] = asPub.length;
  return Buffer.concat([kop, asPub, geheim]);
}

async function stuurEen(ab, tekst, ttl) {
  const url = ab && ab.endpoint;
  if (!TOEGELATEN.test(url || '') || !ab.keys) return { status: 'ongeldig' };
  const lichaam = versleutel(tekst, ab.keys.p256dh, ab.keys.auth);
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: String(ttl), Urgency: 'normal',
      Authorization: 'vapid t=' + jwt(new URL(url).origin) + ', k=' + vapid().publiek
    },
    body: lichaam
  });
  return { status: r.status };
}

// ---------- HTTP ----------
function antwoord(code, data, extra) {
  return { statusCode: code, headers: Object.assign({ 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': herkomst, Vary: 'Origin', 'Cache-Control': 'no-store' }, extra || {}), body: JSON.stringify(data) };
}
function zelfdeGeheim(a, b) {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''));
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}
function kop(event, naam) {
  const h = event.headers || {};
  for (const k of Object.keys(h)) if (k.toLowerCase() === naam) return h[k];
  return '';
}

async function verstuur(d) {
  const m = d.melding || {};
  const melding = JSON.stringify({
    titel: String(m.titel || 'WaasUp').slice(0, 80), tekst: String(m.tekst || '').slice(0, 240),
    link: /^\/[^/]/.test(m.link || '') || /^https:\/\/(www\.)?waasup\.be\//.test(m.link || '') ? m.link : '/lidkaart.html',
    tag: String(m.tag || '').slice(0, 60)
  });
  const ttl = Math.max(60, Math.min(4 * 24 * 3600, parseInt(m.ttl, 10) || 24 * 3600));
  const lijst = Array.isArray(d.abonnementen) ? d.abonnementen.slice(0, 2000) : [];
  const uit = { ok: true, verstuurd: 0, weg: [], fouten: 0 };
  for (let i = 0; i < lijst.length; i += 25) {
    const ronde = await Promise.all(lijst.slice(i, i + 25).map(ab => stuurEen(ab, melding, ttl).catch(() => ({ status: 'fout' }))));
    ronde.forEach((r, j) => {
      const ab = lijst[i + j];
      if (r.status >= 200 && r.status < 300) uit.verstuurd++;
      else if (r.status === 404 || r.status === 410 || r.status === 'ongeldig') uit.weg.push(ab && ab.endpoint);
      else uit.fouten++;
    });
  }
  return uit;
}

async function behandel(event) {
  const methode = (event.httpMethod || event.method || 'GET').toUpperCase();
  const o = kop(event, 'origin'); herkomst = HERKOMST.indexOf(o) > -1 ? o : SITE;
  const pad = String(event.path || '/').replace(/\/+$/, '') || '/';
  if (methode === 'OPTIONS') return antwoord(204, {}, { 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Max-Age': '86400' });
  if (methode === 'GET' && (pad === '/sleutel' || pad === '/')) {
    return antwoord(200, { ok: true, sleutel: vapid().publiek }, { 'Cache-Control': 'public, max-age=3600' });
  }
  if (methode === 'POST' && pad === '/verstuur') {
    if (!zelfdeGeheim(kop(event, 'x-waasup-geheim'), process.env.WAASUP_GEHEIM)) return antwoord(403, { ok: false, fout: 'geheim' });
    let body = event.body || '';
    if (event.isBase64Encoded) body = Buffer.from(body, 'base64').toString('utf8');
    let d; try { d = typeof body === 'string' ? JSON.parse(body) : body; } catch (e) { return antwoord(400, { ok: false, fout: 'json' }); }
    return antwoord(200, await verstuur(d));
  }
  return antwoord(404, { ok: false, fout: 'pad' });
}

module.exports.handle = async (event) => {
  try { return await behandel(event || {}); }
  catch (e) { return antwoord(500, { ok: false, fout: e.message === 'geen-geheim' ? 'geen-geheim' : 'server' }); }
};
// Voor de test hieronder
module.exports._intern = { versleutel, vapid, jwt, verstuur };
