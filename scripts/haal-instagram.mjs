// WaasUp – haalt de nieuwste Instagram-posts op en zet ze in de site zelf.
// Draait automatisch via GitHub Actions (.github/workflows/instagram.yml).
//
// Nodig (als GitHub-secret, nooit in de code):
//   IG_TOKEN    – toegangssleutel van Meta (Instagram Graph API)
//   IG_USER_ID  – het ID van het Instagram-account waasup9140
//
// Resultaat:
//   data/instagram.json      – lijst met de laatste posts (tekst, datum, link, foto)
//   images/insta/<id>.jpg    – lokale kopie van elke foto (geen beelden van Meta-servers op de site)

import { mkdir, writeFile, readdir, unlink, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const AANTAL = 6;
const API = 'https://graph.facebook.com/v21.0';
const MAP_DATA = 'data';
const MAP_BEELD = 'images/insta';

const token = process.env.IG_TOKEN;
const userId = process.env.IG_USER_ID;

if (!token || !userId) {
  console.log('IG_TOKEN of IG_USER_ID ontbreekt nog: niets opgehaald. Het nieuwsblok blijft verborgen.');
  process.exit(0);
}

async function haalJson(url) {
  const r = await fetch(url);
  const j = await r.json();
  if (!r.ok || j.error) throw new Error('Instagram gaf een fout: ' + (j.error?.message || r.status));
  return j;
}

const velden = 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp';
const lijst = await haalJson(`${API}/${userId}/media?fields=${velden}&limit=${AANTAL * 2}&access_token=${encodeURIComponent(token)}`);

await mkdir(MAP_DATA, { recursive: true });
await mkdir(MAP_BEELD, { recursive: true });

const posts = [];
for (const m of lijst.data || []) {
  if (posts.length >= AANTAL) break;
  // Bij video's/reels de coverfoto, bij carrousels en foto's de (eerste) foto
  const bron = m.media_type === 'VIDEO' ? m.thumbnail_url : m.media_url;
  if (!bron) continue;
  const bestand = `${MAP_BEELD}/${m.id}.jpg`;
  if (!existsSync(bestand)) {
    const r = await fetch(bron);
    if (!r.ok) { console.warn('Foto niet gelukt voor', m.id); continue; }
    await writeFile(bestand, Buffer.from(await r.arrayBuffer()));
  }
  const tekst = (m.caption || '').trim();
  posts.push({
    id: m.id,
    datum: new Date(m.timestamp).toISOString(),
    soort: m.media_type === 'VIDEO' ? 'video' : 'foto',
    tekst: tekst.length > 220 ? tekst.slice(0, 217).trimEnd() + '…' : tekst,
    link: m.permalink,
    beeld: bestand,
  });
}

// Oude foto's die niet meer getoond worden opruimen
const inGebruik = new Set(posts.map(p => path.basename(p.beeld)));
for (const f of await readdir(MAP_BEELD)) {
  if (f.endsWith('.jpg') && !inGebruik.has(f)) await unlink(path.join(MAP_BEELD, f));
}

const uit = JSON.stringify({ posts }, null, 2) + '\n';
const oud = existsSync(`${MAP_DATA}/instagram.json`) ? await readFile(`${MAP_DATA}/instagram.json`, 'utf8') : '';
if (uit !== oud) {
  await writeFile(`${MAP_DATA}/instagram.json`, uit);
  console.log(`${posts.length} posts bijgewerkt.`);
} else {
  console.log('Geen nieuwe posts.');
}

// Wanneer vervalt de toegangssleutel? Het Schip toont dat als lampje, zodat een vervallen
// sleutel niet ongemerkt het nieuwsblok stillegt. Enkel een datum, geen sleutel.
try {
  const d = (await haalJson(`${API}/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(token)}`)).data || {};
  const momenten = [d.expires_at, d.data_access_expires_at].filter(t => t > 0);
  const status = JSON.stringify({
    vervalt: momenten.length ? new Date(Math.min(...momenten) * 1000).toISOString().slice(0, 10) : 'nooit',
    geldig: d.is_valid !== false,
  }, null, 2) + '\n';
  const pad = `${MAP_DATA}/instagram-status.json`;
  const vorig = existsSync(pad) ? await readFile(pad, 'utf8') : '';
  if (status !== vorig) await writeFile(pad, status);
} catch (e) {
  console.warn('Vervaldatum van de sleutel niet op te vragen:', e.message);
}
