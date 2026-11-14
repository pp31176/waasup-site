/**
 * WaasUp – vrienden-server (Google Apps Script, gratis)
 *
 * Wat doet dit?
 *  - Nieuwe vrienden (uit de app of van de website) komen in het tabblad "Vrienden" van deze Google Sheet.
 *  - Elke nieuwe vriend krijgt automatisch een welkomstmail met zijn persoonlijke kaartlink.
 *  - "Kaart kwijt?": de vriend krijgt een code van 6 cijfers per mail en zet zo zijn kaart terug in de app.
 *  - Pushmeldingen (zie onderaan): nieuwe activiteit, herinnering een week vooraf, en op de dag zelf
 *    voor wie ingeschreven is. Het versturen zelf gebeurt door de push-verzender bij Scaleway (Parijs).
 *
 * Installeren: zie de stappen in server/LEESMIJ.md
 */

var SITE = 'https://waasup.be';
var SHEET_ID = '1koxdwlquDH9hs8z_lNk8p2K4OXQi9Rvf_VkHPBDMxYM'; // Google Sheet "WaasUp Vrienden"
var BLAD = 'Vrienden';
var AFZENDER = 'WaasUp';
var ANTWOORD_ADRES = 'info@waasup.be';
var KOLOMMEN = ['Datum', 'Vriendnummer', 'Voornaam', 'Achternaam', 'E-mail', 'Gsm', 'Volwassenen', 'Kinderen',
  'Gezinsleden', 'Geldig tot', 'Rol', 'Straat', 'Bron', 'Toestemming', 'Kaartlink', 'Huisdieren'];
var K = {}; KOLOMMEN.forEach(function (n, i) { K[n] = i; });

function doGet() { return ContentService.createTextOutput('De WaasUp vrienden-server werkt.'); }

function doPost(e) {
  var d;
  try { d = JSON.parse(e.postData.contents); } catch (x) { return uit({ ok: false, fout: 'json' }); }
  var slot = LockService.getScriptLock();
  slot.waitLock(15000);
  try {
    if (d.actie === 'inschrijven') return uit(inschrijven(d));
    if (d.actie === 'aanmelden') return uit(aanmelden(d));
    if (d.actie === 'code') return uit(stuurCode(d));
    if (d.actie === 'ophalen') return uit(ophalen(d));
    if (d.actie === 'melding-aan') return uit(meldingAan(d));
    if (d.actie === 'melding-uit') return uit(meldingUit(d));
    if (d.eventType === 'FORM_RESPONSE' && d.data) return uit(tallyInschrijving(d.data));
    return uit({ ok: false, fout: 'actie' });
  } catch (x) {
    console.error(x);
    return uit({ ok: false, fout: 'server' });
  } finally { slot.releaseLock(); }
}

// ---------- Acties ----------

// Nieuwe vriend (app, website of interne pagina kaart-maken). Elke vrijwilliger is ook vriend.
function inschrijven(d) {
  var k = d.kaart || {}, mail = schoon(d.email, 120).toLowerCase(), bron = schoon(d.bron, 20) || 'app';
  if (!/^WU-\d{4}-[A-Z0-9]{4}$/.test(k.n || '') || !schoon(k.v, 60) || !mailOk(mail)) return { ok: false, fout: 'gegevens' };
  var rol = d.rol === 'allebei' || d.rol === 'vrijwilliger' ? 'vriend + vrijwilliger' : 'vriend';
  var hd = d.huisdieren !== undefined ? d.huisdieren : k.hd;
  var kaart = maakKaart(k.n, k.v, k.a, k.g, k.vo, k.ki, k.gl, hd);
  var bestaand = zoekRij(function (r) { return r[K.Vriendnummer] === kaart.n; });
  // Zelfde e-mailadres al vriend (via app of website)? Geen tweede kaart: de bestaande terugsturen.
  if (!bestaand && bron !== 'handmatig') {
    var zelfde = zoekRij(function (r) { return String(r[K['E-mail']]).toLowerCase() === mail && r[K.Vriendnummer]; });
    if (zelfde) {
      // Bestaande kaart (zelfde nummer) bijwerken met het gezin en de huisdieren van deze nieuwe inschrijving
      var z = zelfde.r, oud = maakKaart(z[K.Vriendnummer], z[K.Voornaam], z[K.Achternaam], z[K['Geldig tot']], kaart.vo, kaart.ki, kaart.gl,
        hd !== undefined ? hd : z[K.Huisdieren]);
      var upd = { Volwassenen: oud.vo, Kinderen: oud.ki, Gezinsleden: oud.gl, Huisdieren: oud.hd || '', Kaartlink: kaartLink(oud) };
      if (rol !== 'vriend' && z[K.Rol] === 'vriend') upd.Rol = rol;
      schrijfRij(zelfde.nr, upd);
      welkomstmail(mail, oud, rol !== 'vriend');
      return { ok: true, bestond: true, kaart: oud };
    }
  }
  var rij = { Vriendnummer: kaart.n, Voornaam: kaart.v, Achternaam: kaart.a, 'E-mail': mail, Gsm: schoon(d.gsm, 30),
    Volwassenen: kaart.vo, Kinderen: kaart.ki, Gezinsleden: kaart.gl, 'Geldig tot': kaart.g, Rol: rol, Straat: schoon(d.straat, 120),
    Bron: bron + (d.taal && d.taal !== 'nl' ? ' (' + schoon(d.taal, 2) + ')' : ''), Toestemming: 'ja', Kaartlink: kaartLink(kaart) };
  if (hd !== undefined) rij.Huisdieren = kaart.hd || '';
  if (bestaand) { delete rij.Rol; schrijfRij(bestaand.nr, rij); } else voegToe(rij);
  if (!d.geenMail && !bestaand) welkomstmail(mail, kaart, rol !== 'vriend');
  return { ok: true, kaart: kaart };
}

// Formulier "Doe mee" op de website
function aanmelden(d) {
  var mail = schoon(d.email, 120).toLowerCase(), v = schoon(d.voornaam, 60), a = schoon(d.achternaam, 60);
  if (!v || !mailOk(mail)) return { ok: false, fout: 'gegevens' };
  var rol = ['vriend', 'vrijwilliger', 'allebei'].indexOf(d.rol) > -1 ? d.rol : 'vriend';
  var rij = { Voornaam: v, Achternaam: a, 'E-mail': mail, Gsm: schoon(d.gsm, 30), Rol: rol, Straat: schoon(d.straat, 120),
    Bron: 'website' + (d.taal && d.taal !== 'nl' ? ' (' + d.taal + ')' : ''), Toestemming: d.toestemming === 'ja' ? 'ja' : '' };
  if (rol === 'vrijwilliger') {
    voegToe(rij);
    stuurMail(mail, 'Welkom als vrijwilliger bij WaasUp', '<p>Dag ' + html(v) + ',</p><p>Bedankt om vrijwilliger te worden bij WaasUp! ' +
      'Zodra er een activiteit live gaat, laten we je weten waar we hulp kunnen gebruiken. Jij kiest wanneer je meehelpt.</p>');
    return { ok: true };
  }
  // Al vriend met dit e-mailadres? Dan geen tweede kaart, wel de bestaande link opnieuw sturen.
  var bestaand = zoekRij(function (r) { return String(r[K['E-mail']]).toLowerCase() === mail && r[K.Vriendnummer]; });
  if (bestaand) { welkomstmail(mail, kaartUitRij(bestaand.r)); return { ok: true }; }
  var kaart = maakKaart(nieuwNummer(), v, a, (new Date().getFullYear() + 1) + '-12-31', 1, 0, '');
  rij.Vriendnummer = kaart.n; rij.Volwassenen = 1; rij.Kinderen = 0; rij['Geldig tot'] = kaart.g; rij.Kaartlink = kaartLink(kaart);
  voegToe(rij);
  welkomstmail(mail, kaart, rol === 'allebei');
  return { ok: true };
}

// "Kaart kwijt?" stap 1: code mailen (antwoordt altijd ok, zodat niemand kan uitzoeken wie vriend is)
function stuurCode(d) {
  var mail = schoon(d.email, 120).toLowerCase();
  if (!mailOk(mail)) return { ok: true };
  var cache = CacheService.getScriptCache(), teller = Number(cache.get('aantal:' + mail) || 0);
  if (teller >= 5) return { ok: true };            // max 5 codes per uur per adres
  cache.put('aantal:' + mail, String(teller + 1), 3600);
  var gevonden = zoekRij(function (r) { return String(r[K['E-mail']]).toLowerCase() === mail && r[K.Vriendnummer]; });
  if (!gevonden) return { ok: true };
  var code = String(Math.floor(100000 + Math.random() * 900000));
  cache.put('code:' + mail, JSON.stringify({ code: code, pogingen: 0 }), 900); // 15 minuten geldig
  stuurMail(mail, 'Je code voor de WaasUp-vriendenkaart: ' + code,
    '<p>Dag ' + html(gevonden.r[K.Voornaam]) + ',</p><p>Vul deze code in de WaasUp-app in om je vriendenkaart terug te zetten:</p>' +
    '<p style="font-size:32px;font-weight:800;letter-spacing:6px;color:#011737;margin:18px 0">' + code + '</p>' +
    '<p>De code is 15 minuten geldig. Heb je dit niet zelf gevraagd? Dan mag je deze mail gewoon negeren.</p>');
  return { ok: true };
}

// "Kaart kwijt?" stap 2: code controleren en kaart teruggeven
function ophalen(d) {
  var mail = schoon(d.email, 120).toLowerCase(), cache = CacheService.getScriptCache();
  var bewaard = cache.get('code:' + mail);
  if (!bewaard) return { ok: false, fout: 'code' };
  bewaard = JSON.parse(bewaard);
  if (String(d.code) !== bewaard.code) {
    bewaard.pogingen++;
    if (bewaard.pogingen >= 5) cache.remove('code:' + mail); else cache.put('code:' + mail, JSON.stringify(bewaard), 900);
    return { ok: false, fout: 'code' };
  }
  cache.remove('code:' + mail);
  var gevonden = zoekRij(function (r) { return String(r[K['E-mail']]).toLowerCase() === mail && r[K.Vriendnummer]; });
  if (!gevonden) return { ok: false, fout: 'code' };
  return { ok: true, kaart: kaartUitRij(gevonden.r) };
}

// ---------- Mails ----------

function welkomstmail(mail, kaart, ookVrijwilliger) {
  var link = kaartLink(kaart);
  stuurMail(mail, 'Welkom bij de Vrienden van WaasUp! Hier is je vriendenkaart',
    '<p>Dag ' + html(kaart.v) + ',</p>' +
    '<p>Welkom bij de Vrienden van WaasUp' + (ookVrijwilliger ? ', en bedankt om ook vrijwilliger te worden' : '') + '! ' +
    'Je vriendnummer is <b>' + kaart.n + '</b>' + (kaart.vo + kaart.ki > 1 ? ' (voor ' + gezin(kaart) + ')' : '') + '.</p>' +
    '<p>Open je digitale vriendenkaart op je gsm:</p>' +
    '<p><a href="' + link + '" style="display:inline-block;background:#FDB112;color:#011737;font-weight:800;text-decoration:none;padding:14px 26px;border-radius:999px">Open mijn vriendenkaart</a></p>' +
    '<p>Tip: zet de kaart op je beginscherm (iPhone: Safari › Deel › Zet op beginscherm). ' +
    'Zie je je kaart daarna niet in de app? Tik dan op <b>Kaart kwijt?</b> en vul dit e-mailadres in.</p>' +
    '<p>Je voordelen: je hoort als eerste wanneer een activiteit live gaat, je krijgt voorrang bij het inschrijven ' +
    'en korting op activiteiten waar een bijdrage voor gevraagd wordt.</p>');
}

function stuurMail(aan, onderwerp, inhoud) {
  var htmlBody = '<div style="font-family:Montserrat,Arial,sans-serif;font-size:15px;line-height:1.6;color:#011737;max-width:560px">' +
    '<p style="font-size:26px;font-weight:800;margin:0 0 16px">Waas<span style="color:#FDB112">Up</span></p>' + inhoud +
    '<p>Hartelijke groeten,<br>WaasUp</p><p style="font-size:12px;color:#5A6880">WaasUp vzw · Vijfhuizenstraat 13, 9140 Temse · ' +
    '<a href="' + SITE + '" style="color:#5A6880">waasup.be</a> · Uitschrijven? Antwoord gewoon op deze mail.</p></div>';
  GmailApp.sendEmail(aan, onderwerp, htmlBody.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '),
    { htmlBody: htmlBody, name: AFZENDER, from: 'info@waasup.be', replyTo: ANTWOORD_ADRES });
}

// ---------- Hulpjes ----------

function blad() {
  var ss = SpreadsheetApp.openById(SHEET_ID), b = ss.getSheetByName(BLAD);
  if (!b) b = ss.insertSheet(BLAD);
  if (b.getLastRow() === 0) { b.appendRow(KOLOMMEN); b.setFrozenRows(1); b.getRange(1, 1, 1, KOLOMMEN.length).setFontWeight('bold'); }
  // Nieuwe kolommen (zoals Huisdieren) achteraan bijzetten in een bestaand blad
  else if (b.getLastColumn() < KOLOMMEN.length) {
    var van = b.getLastColumn() + 1, nieuw = KOLOMMEN.slice(van - 1);
    b.getRange(1, van, 1, nieuw.length).setValues([nieuw]).setFontWeight('bold');
  }
  return b;
}
function voegToe(rij) {
  var r = KOLOMMEN.map(function (n) { return n === 'Datum' ? new Date() : veilig(rij[n], n); });
  blad().appendRow(r);
}
function schrijfRij(nr, rij) {
  var b = blad(), r = b.getRange(nr, 1, 1, KOLOMMEN.length).getValues()[0];
  KOLOMMEN.forEach(function (n, i) { if (n !== 'Datum' && rij[n] !== undefined) r[i] = veilig(rij[n], n); });
  b.getRange(nr, 1, 1, KOLOMMEN.length).setValues([r]);
}
// Zoekt van onder naar boven (nieuwste eerst)
function zoekRij(test) {
  var b = blad(), n = b.getLastRow();
  if (n < 2) return null;
  var rijen = b.getRange(2, 1, n - 1, KOLOMMEN.length).getDisplayValues();
  for (var i = rijen.length - 1; i >= 0; i--) if (test(rijen[i])) return { nr: i + 2, r: rijen[i] };
  return null;
}
function kaartUitRij(r) {
  return maakKaart(r[K.Vriendnummer], r[K.Voornaam], r[K.Achternaam], r[K['Geldig tot']], Number(r[K.Volwassenen] || 1), Number(r[K.Kinderen] || 0), r[K.Gezinsleden], r[K.Huisdieren]);
}
function maakKaart(n, v, a, g, vo, ki, gl, hd) {
  vo = Math.max(0, Math.min(12, parseInt(vo, 10) || 0)); ki = Math.max(0, Math.min(12, parseInt(ki, 10) || 0));
  if (vo + ki < 1) vo = 1;
  var kaart = { n: String(n), v: schoon(v, 60), a: schoon(a, 60), g: /^\d{4}-\d{2}-\d{2}$/.test(g) ? g : (new Date().getFullYear() + 1) + '-12-31',
    vo: vo, ki: ki, gl: schoon(gl, 120) };
  hd = schoon(hd, 200);
  if (hd) kaart.hd = hd;
  return kaart;
}
function kaartLink(k) {
  var b64 = Utilities.base64EncodeWebSafe(Utilities.newBlob(JSON.stringify(k)).getBytes()).replace(/=+$/, '');
  return SITE + '/lidkaart.html#k=' + b64;
}
function nieuwNummer() {
  var tekens = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', d = new Date(), r = '';
  for (var i = 0; i < 4; i++) r += tekens.charAt(Math.floor(Math.random() * tekens.length));
  return 'WU-' + String(d.getFullYear()).slice(2) + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + r;
}
function gezin(k) {
  var d = [];
  if (k.vo) d.push(k.vo + (k.vo === 1 ? ' volwassene' : ' volwassenen'));
  if (k.ki) d.push(k.ki + (k.ki === 1 ? ' kind' : ' kinderen'));
  return d.join(' en ');
}
function schoon(x, max) { return String(x == null ? '' : x).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max || 200); }
function veilig(x, kolom) { x = x == null ? '' : x; if ((kolom === 'Gsm' || kolom === 'Geldig tot') && x !== '') return "'" + x; return typeof x === 'string' && /^[=+\-@]/.test(x) ? "'" + x : x; } // geen formules in de Sheet
function mailOk(m) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(m); }
function html(x) { return String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function uit(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

// =====================================================================
// Pushmeldingen
// =====================================================================
// Tabbladen in de Sheet (worden vanzelf aangemaakt):
//  - "Activiteiten": één regel per activiteit. Zet "Online" op ja zodra ze op de site staat.
//      De kolommen "Melding nieuw", "Herinnering 1 week" en "Melding dag zelf" vult het script zelf in.
//  - "Meldingen": eigen melding versturen? Vul Titel, Tekst en Voor in (iedereen of een vriendnummer).
//      Binnen het uur vertrekt ze; daarna staat de datum en het resultaat erbij. Ook de automatische meldingen komen hier.
//  - "Toestellen": gsm's waarop meldingen aanstaan (geen namen, enkel het vriendnummer als dat gekend is).
//  - "Inschrijvingen activiteiten": komt binnen via Tally (webhook) en wordt gebruikt voor de melding op de dag zelf.
// Eenmalig: voer pushInstellen() uit. Daarna draait meldingenRonde() elk uur.

var PUSH_URL = ''; // adres van de push-verzender bij Scaleway, zonder / op het einde
var TZ = 'Europe/Brussels';
var T_ACT = 'Activiteiten', T_MELD = 'Meldingen', T_TOE = 'Toestellen', T_INS = 'Inschrijvingen activiteiten';
var KOL_ACT = ['Titel', 'Datum', 'Uur', 'Plaats', 'Link', 'Online', 'Tally-formulier', 'Melding nieuw', 'Herinnering 1 week', 'Melding dag zelf'];
var KOL_MELD = ['Titel', 'Tekst', 'Link', 'Voor', 'Verstuurd op', 'Resultaat'];
var KOL_TOE = ['Datum', 'Vriendnummer', 'Endpoint', 'P256dh', 'Auth', 'Toestel', 'Laatst bijgewerkt'];
var KOL_INS = ['Datum', 'Tally-formulier', 'Formulier', 'E-mail', 'Vriendnummer'];

function tab(naam, kol) {
  var ss = SpreadsheetApp.openById(SHEET_ID), b = ss.getSheetByName(naam);
  if (!b) b = ss.insertSheet(naam);
  if (b.getLastRow() === 0) { b.appendRow(kol); b.setFrozenRows(1); b.getRange(1, 1, 1, kol.length).setFontWeight('bold'); }
  return b;
}
function rijen(b, kol) {
  var n = b.getLastRow();
  return n < 2 ? [] : b.getRange(2, 1, n - 1, kol.length).getValues();
}
function vandaag() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'); }
function isoDatum(x) {
  if (x instanceof Date) return Utilities.formatDate(x, TZ, 'yyyy-MM-dd');
  var s = String(x || '').trim(), m;
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) return m[1] + '-' + m[2] + '-' + m[3];
  if ((m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/))) return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
  return '';
}
function dagenTussen(a, b) { return Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5); }
function datumTekst(iso) {
  var d = new Date(iso + 'T12:00:00Z');
  var dagen = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];
  var maanden = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
  return dagen[d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + maanden[d.getUTCMonth()];
}
function uurTekst(u) { return u instanceof Date ? Utilities.formatDate(u, TZ, 'H:mm') : String(u || '').trim(); }

// ---------- Vanuit de app ----------
var PUSH_HOSTS = /^https:\/\/([a-z0-9-]+\.)*(fcm\.googleapis\.com|push\.apple\.com|push\.services\.mozilla\.com|notify\.windows\.com)\//i;

function meldingAan(d) {
  var ab = d.abonnement || {}, keys = ab.keys || {};
  if (!PUSH_HOSTS.test(ab.endpoint || '') || String(ab.endpoint).length > 1000 || !keys.p256dh || !keys.auth) return { ok: false, fout: 'gegevens' };
  var nr = /^WU-\d{4}-[A-Z0-9]{4}$/.test(d.vriendnummer || '') ? d.vriendnummer : '';
  var b = tab(T_TOE, KOL_TOE), r = rijen(b, KOL_TOE), nu = new Date();
  var waarden = [nu, nr, ab.endpoint, schoon(keys.p256dh, 200), schoon(keys.auth, 100), schoon(d.toestel, 40), nu];
  for (var i = 0; i < r.length; i++) {
    if (r[i][2] === ab.endpoint) { waarden[0] = r[i][0]; b.getRange(i + 2, 1, 1, KOL_TOE.length).setValues([waarden]); return { ok: true }; }
  }
  b.appendRow(waarden);
  return { ok: true };
}

function meldingUit(d) {
  var b = tab(T_TOE, KOL_TOE), r = rijen(b, KOL_TOE);
  for (var i = r.length - 1; i >= 0; i--) if (r[i][2] === d.endpoint) b.deleteRow(i + 2);
  return { ok: true };
}

// ---------- Tally (webhook bij elke inschrijving voor een activiteit) ----------
function tallyInschrijving(data) {
  var mail = '', vriend = '';
  (data.fields || []).forEach(function (f) {
    var w = Array.isArray(f.value) ? f.value.join(' ') : String(f.value == null ? '' : f.value);
    if (!mail && (f.type === 'INPUT_EMAIL' || /e-?mail/i.test(f.label || '')) && mailOk(w.trim())) mail = w.trim().toLowerCase();
    if (!vriend && /^vriend/i.test(f.label || '') && /^WU-\d{4}-[A-Z0-9]{4}$/.test(w.trim())) vriend = w.trim();
  });
  tab(T_INS, KOL_INS).appendRow([new Date(), schoon(data.formId, 20), schoon(data.formName, 100), mail, vriend]);
  return { ok: true };
}

// ---------- Elk uur ----------
function meldingenRonde() {
  if (!PUSH_URL) return;
  var slot = LockService.getScriptLock();
  if (!slot.tryLock(30000)) return;
  try {
    var uur = Number(Utilities.formatDate(new Date(), TZ, 'H'));
    if (uur >= 7 && uur < 21) activiteitenMeldingen(uur);
    if (uur >= 8 && uur < 22) eigenMeldingen();
  } finally { slot.releaseLock(); }
}

function activiteitenMeldingen(uur) {
  var b = tab(T_ACT, KOL_ACT), r = rijen(b, KOL_ACT), nu = vandaag(), A = {};
  KOL_ACT.forEach(function (n, i) { A[n] = i; });
  r.forEach(function (rij, i) {
    var titel = String(rij[A.Titel] || '').trim(), datum = isoDatum(rij[A.Datum]);
    if (!titel || !datum || !/^ja/i.test(String(rij[A.Online]))) return;
    var dagen = dagenTussen(nu, datum), nr = i + 2;
    var link = String(rij[A.Link] || '').trim() || '/activiteiten.html';
    var wanneer = datumTekst(datum) + (uurTekst(rij[A.Uur]) ? ' om ' + uurTekst(rij[A.Uur]) : '');
    var waar = String(rij[A.Plaats] || '').trim();
    function zet(kolom, waarde) { b.getRange(nr, A[kolom] + 1).setValue(waarde); }

    // 1. Nieuwe activiteit online (vanaf 9 uur)
    if (!rij[A['Melding nieuw']] && uur >= 9) {
      if (dagen < 0) { zet('Melding nieuw', 'niet nodig'); return; }
      var r1 = verstuurMelding({ titel: 'Nieuw bij WaasUp: ' + titel, tekst: wanneer + (waar ? ', ' + waar : '') + '. Vrienden horen het als eerste: schrijf je in!', link: link, tag: 'nieuw-' + nr }, 'iedereen');
      zet('Melding nieuw', stempel(r1));
      if (dagen <= 7) zet('Herinnering 1 week', 'niet nodig');
      return;
    }
    // 2. Herinnering: nog een week (vanaf 9 uur)
    if (!rij[A['Herinnering 1 week']] && uur >= 9 && dagen <= 7 && dagen >= 1) {
      var r2 = verstuurMelding({ titel: 'Nog een week: ' + titel, tekst: wanneer + (waar ? ', ' + waar : '') + '. Ben je erbij?', link: link, tag: 'week-' + nr }, 'iedereen');
      zet('Herinnering 1 week', stempel(r2));
      return;
    }
    // 3. Op de dag zelf, enkel voor wie ingeschreven is (vanaf 7 uur)
    if (!rij[A['Melding dag zelf']] && dagen === 0) {
      var nummers = ingeschrevenen(String(rij[A['Tally-formulier']] || '').trim());
      if (!nummers.length) { zet('Melding dag zelf', 'niemand met de app ingeschreven'); return; }
      var r3 = verstuurMelding({ titel: 'Vandaag: ' + titel + '!', tekst: 'We kijken ernaar uit je te zien' + (uurTekst(rij[A.Uur]) ? ' om ' + uurTekst(rij[A.Uur]) : '') +
        (waar ? ' in ' + waar : '') + '. Toon je vriendenkaart aan het onthaal.', link: '/lidkaart.html', tag: 'dag-' + nr }, nummers);
      zet('Melding dag zelf', stempel(r3));
    }
    if (!rij[A['Melding dag zelf']] && dagen < 0) zet('Melding dag zelf', 'voorbij');
  });
}

// Vriendnummers van wie via Tally ingeschreven is (rechtstreeks of via hetzelfde e-mailadres als bij de vriendenkaart)
function ingeschrevenen(formulier) {
  if (!formulier) return [];
  var ins = rijen(tab(T_INS, KOL_INS), KOL_INS).filter(function (r) { return String(r[1]) === formulier; });
  var perMail = {};
  var b = blad(), n = b.getLastRow();
  if (n > 1) b.getRange(2, 1, n - 1, KOLOMMEN.length).getDisplayValues().forEach(function (r) {
    if (r[K.Vriendnummer]) perMail[String(r[K['E-mail']]).toLowerCase()] = r[K.Vriendnummer];
  });
  var set = {};
  ins.forEach(function (r) {
    if (r[4]) set[r[4]] = 1;
    var viaMail = perMail[String(r[3]).toLowerCase()];
    if (viaMail) set[viaMail] = 1;
  });
  return Object.keys(set);
}

function eigenMeldingen() {
  var b = tab(T_MELD, KOL_MELD), r = rijen(b, KOL_MELD);
  r.forEach(function (rij, i) {
    if (rij[4] || !String(rij[0]).trim() || !String(rij[1]).trim()) return;
    var voor = String(rij[3] || '').trim();
    var doel = /^WU-/i.test(voor) ? voor.toUpperCase().split(/[\s,;]+/).filter(Boolean) : (/^iedereen$/i.test(voor) ? 'iedereen' : null);
    if (!doel) { b.getRange(i + 2, 6).setValue('Vul bij Voor "iedereen" of een vriendnummer in'); return; }
    var res = verstuurMelding({ titel: String(rij[0]).trim(), tekst: String(rij[1]).trim(), link: String(rij[2] || '').trim() || '/lidkaart.html', tag: 'eigen-' + (i + 2) }, doel, true);
    b.getRange(i + 2, 5, 1, 2).setValues([[new Date(), resultaatTekst(res)]]);
  });
}

// ---------- Versturen via de push-verzender (Scaleway) ----------
// doel: 'iedereen' of een lijst vriendnummers
function verstuurMelding(melding, doel, geenLog) {
  var geheim = PropertiesService.getScriptProperties().getProperty('PUSH_GEHEIM');
  if (!PUSH_URL || !geheim) return { ok: false, fout: 'niet ingesteld' };
  var b = tab(T_TOE, KOL_TOE), r = rijen(b, KOL_TOE);
  var lijst = r.filter(function (x) { return doel === 'iedereen' || doel.indexOf(String(x[1])) > -1; })
    .map(function (x) { return { endpoint: x[2], keys: { p256dh: x[3], auth: x[4] } }; });
  var res = { ok: true, verstuurd: 0, weg: [], fouten: 0, toestellen: lijst.length };
  if (lijst.length) {
    var antw = UrlFetchApp.fetch(PUSH_URL + '/verstuur', { method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { 'X-WaasUp-Geheim': geheim }, payload: JSON.stringify({ abonnementen: lijst, melding: melding }) });
    try { var j = JSON.parse(antw.getContentText()); } catch (e) { j = { ok: false, fout: 'antwoord ' + antw.getResponseCode() }; }
    if (!j.ok) return { ok: false, fout: j.fout || ('code ' + antw.getResponseCode()), toestellen: lijst.length };
    res.verstuurd = j.verstuurd; res.fouten = j.fouten; res.weg = j.weg || [];
    // Toestellen die niet meer bestaan (app verwijderd, meldingen uitgezet) opruimen
    for (var i = r.length - 1; i >= 0; i--) if (res.weg.indexOf(r[i][2]) > -1) b.deleteRow(i + 2);
  }
  if (!geenLog) tab(T_MELD, KOL_MELD).appendRow([melding.titel, melding.tekst, melding.link,
    doel === 'iedereen' ? 'iedereen' : doel.length + ' ingeschreven vriend(en)', new Date(), resultaatTekst(res)]);
  return res;
}
function resultaatTekst(r) {
  if (!r.ok) return 'mislukt: ' + r.fout;
  return r.verstuurd + ' van ' + r.toestellen + ' toestel(len)' + (r.weg.length ? ', ' + r.weg.length + ' opgeruimd' : '') + (r.fouten ? ', ' + r.fouten + ' fout(en)' : '');
}
function stempel(r) { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm') + ' – ' + resultaatTekst(r); }

// ---------- Eenmalig instellen ----------
// Maakt het geheim aan (enkel als het er nog niet is), de tabbladen en de uurlijkse controle.
// Het geheim kopieer je zelf naar Scaleway (geheime variabele WAASUP_GEHEIM).
function pushInstellen() {
  var p = PropertiesService.getScriptProperties();
  if (!p.getProperty('PUSH_GEHEIM')) {
    var bytes = []; for (var i = 0; i < 4; i++) bytes = bytes.concat(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + Math.random() + Date.now()));
    p.setProperty('PUSH_GEHEIM', Utilities.base64EncodeWebSafe(bytes.slice(0, 36)).replace(/=+$/, ''));
  }
  tab(T_ACT, KOL_ACT); tab(T_MELD, KOL_MELD); tab(T_TOE, KOL_TOE); tab(T_INS, KOL_INS);
  var heeft = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'meldingenRonde'; });
  if (!heeft) ScriptApp.newTrigger('meldingenRonde').timeBased().everyHours(1).create();
  console.log('Klaar. Kopieer dit geheim naar Scaleway als geheime variabele WAASUP_GEHEIM:\n' + p.getProperty('PUSH_GEHEIM'));
}
