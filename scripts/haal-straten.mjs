// Haalt alle benoemde straten van Groot-Temse op uit OpenStreetMap (Overpass)
// en bewaart ze compact in data/temse-straten.json, zodat de kaart niet live
// van Overpass afhangt.
import { writeFileSync, mkdirSync } from 'node:fs';
const Q = '[out:json][timeout:90];area["name"="Temse"]["admin_level"="8"]->.a;way(area.a)["highway"~"residential|living_street|tertiary|secondary|unclassified|primary"]["name"];out geom;';
const SERVERS = ['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter','https://overpass.private.coffee/api/interpreter'];
let data;
ronde: for (let ronde = 1; ronde <= 4; ronde++) {
if (ronde > 1) { console.log('Nieuwe poging over 90 s'); await new Promise(r => setTimeout(r, 90000)); }
for (const s of SERVERS) {
  try {
    const r = await fetch(s, { method: 'POST', body: 'data=' + encodeURIComponent(Q), headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'waasup.be straten (info@waasup.be)' }, signal: AbortSignal.timeout(120000) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    data = await r.json();
    if (data.elements?.length) { console.log('OK via', s, data.elements.length, 'wegen'); break ronde; }
  } catch (e) { console.log('Mislukt:', s, e.message); }
}
}
if (!data?.elements?.length) { console.error('Geen data'); process.exit(1); }
const straten = {};
for (const w of data.elements) {
  if (!w.geometry) continue;
  (straten[w.tags.name] ||= []).push(w.geometry.map(p => [+p.lat.toFixed(5), +p.lon.toFixed(5)]));
}
mkdirSync('data', { recursive: true });
writeFileSync('data/temse-straten.json', JSON.stringify(straten));
console.log(Object.keys(straten).length, 'straten bewaard');
