/**
 * WaasUp – vrienden-server (Google Apps Script, gratis)
 *
 * Wat doet dit?
 *  - Nieuwe vrienden (uit de app of van de website) komen in het tabblad "Vrienden" van deze Google Sheet.
 *  - Elke nieuwe vriend krijgt automatisch een welkomstmail met zijn persoonlijke kaartlink.
 *  - "Kaart kwijt?": de vriend krijgt een code van 6 cijfers per mail en zet zo zijn kaart terug in de app.
 *
 * Installeren: zie de stappen in server/LEESMIJ.md
 */

var SITE = 'https://waasup.be';
var BLAD = 'Vrienden';
var AFZENDER = 'WaasUp';
var ANTWOORD_ADRES = 'info@waasup.be';
var KOLOMMEN = ['Datum', 'Vriendnummer', 'Voornaam', 'Achternaam', 'E-mail', 'Gsm', 'Volwassenen', 'Kinderen',
  'Gezinsleden', 'Geldig tot', 'Rol', 'Straat', 'Bron', 'Toestemming', 'Kaartlink'];
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
    return uit({ ok: false, fout: 'actie' });
  } catch (x) {
    console.error(x);
    return uit({ ok: false, fout: 'server' });
  } finally { slot.releaseLock(); }
}

// ---------- Acties ----------

// Kaart gemaakt in de app (of op de interne pagina kaart-maken)
function inschrijven(d) {
  var k = d.kaart || {}, mail = schoon(d.email, 120).toLowerCase();
  if (!/^WU-\d{4}-[A-Z0-9]{4}$/.test(k.n || '') || !schoon(k.v, 60) || !mailOk(mail)) return { ok: false, fout: 'gegevens' };
  var kaart = maakKaart(k.n, k.v, k.a, k.g, k.vo, k.ki, k.gl);
  var rij = { Vriendnummer: kaart.n, Voornaam: kaart.v, Achternaam: kaart.a, 'E-mail': mail, Gsm: schoon(d.gsm, 30),
    Volwassenen: kaart.vo, Kinderen: kaart.ki, Gezinsleden: kaart.gl, 'Geldig tot': kaart.g, Rol: 'vriend',
    Bron: schoon(d.bron, 20) || 'app', Toestemming: 'ja', Kaartlink: kaartLink(kaart) };
  var bestaand = zoekRij(function (r) { return r[K.Vriendnummer] === kaart.n; });
  if (bestaand) schrijfRij(bestaand.nr, rij); else voegToe(rij);
  if (!d.geenMail && !bestaand) welkomstmail(mail, kaart);
  return { ok: true, n: kaart.n };
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
  MailApp.sendEmail({ to: aan, subject: onderwerp, htmlBody: htmlBody, body: htmlBody.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '),
    name: AFZENDER, replyTo: ANTWOORD_ADRES });
}

// ---------- Hulpjes ----------

function blad() {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), b = ss.getSheetByName(BLAD);
  if (!b) b = ss.insertSheet(BLAD);
  if (b.getLastRow() === 0) { b.appendRow(KOLOMMEN); b.setFrozenRows(1); b.getRange(1, 1, 1, KOLOMMEN.length).setFontWeight('bold'); }
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
  return maakKaart(r[K.Vriendnummer], r[K.Voornaam], r[K.Achternaam], r[K['Geldig tot']], Number(r[K.Volwassenen] || 1), Number(r[K.Kinderen] || 0), r[K.Gezinsleden]);
}
function maakKaart(n, v, a, g, vo, ki, gl) {
  vo = Math.max(0, Math.min(12, parseInt(vo, 10) || 0)); ki = Math.max(0, Math.min(12, parseInt(ki, 10) || 0));
  if (vo + ki < 1) vo = 1;
  return { n: String(n), v: schoon(v, 60), a: schoon(a, 60), g: /^\d{4}-\d{2}-\d{2}$/.test(g) ? g : (new Date().getFullYear() + 1) + '-12-31',
    vo: vo, ki: ki, gl: schoon(gl, 120) };
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
