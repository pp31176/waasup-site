/**
 * WaasUp – partners in de backoffice (zelfde Google Sheet "WaasUp Vrienden", tabblad "Partners")
 *
 * Wat doet dit?
 *  - Een aanvraag via het partnerformulier op waasup.be komt automatisch als rij in het tabblad "Partners".
 *    De aanvrager krijgt een bevestigingsmail, info@waasup.be krijgt een seintje.
 *  - De knop: kies in de kolom "Pakket" het gekozen pakket en vink "Logo-info sturen" aan
 *    (of: menu WaasUp › Logo-info sturen naar geselecteerde partner).
 *    De partner krijgt dan meteen een mail met alles wat we nodig hebben voor zijn activatie:
 *    logo-bestanden, pixels en DPI, kleurcodes, en wat er per pakket nog extra nodig is,
 *    plus een persoonlijke link om alles op te laden.
 *  - Opgeladen bestanden komen in Google Drive in de map "WaasUp Partnerlogo's", per partner een eigen map.
 *    De rij krijgt status "Logo ontvangen" en info@waasup.be krijgt een seintje.
 *
 * Werkt ook in de Google Sheets-app op je gsm (het vinkje), op voorwaarde dat de knop één keer
 * geactiveerd is: menu WaasUp › Knop activeren (eenmalig). Zie server/LEESMIJ.md.
 */

var P_BLAD = 'Partners';
var P_KOLOMMEN = ['Datum', 'Code', 'Bedrijf', 'Naam', 'E-mail', 'Telefoon', 'Pakket', 'Status',
  'Logo-info sturen', 'Logo-info verstuurd op', 'Logo ontvangen op', 'Logo-map', 'Kleurcodes', 'Voorstelling', 'Notities', 'Bron'];
var PK = {}; P_KOLOMMEN.forEach(function (n, i) { PK[n] = i; });
var PAKKETTEN = ['Bouwsteen', 'Sleuteldrager', 'Hart van Temse', 'Op maat', 'Nog geen idee'];
var LOGO_MAP = "WaasUp Partnerlogo's";
// Pas gerust aan: termijn die in de mail staat
var LOGO_TERMIJN = 'graag binnen de 14 dagen, en zeker 6 weken vóór de activiteit die je steunt (dan gaan affiches en flyers naar de drukker)';

// ---------- Menu en knop ----------

function onOpen() {
  SpreadsheetApp.getUi().createMenu('WaasUp')
    .addItem('Logo-info sturen naar geselecteerde partner', 'logoInfoGeselecteerd')
    .addSeparator()
    .addItem('Knop activeren (eenmalig)', 'knopActiveren')
    .addToUi();
}

// Eenmalig: zorgt dat het vinkje "Logo-info sturen" ook vanop je gsm werkt
function knopActiveren() {
  var bestaat = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'bijAanvinken'; });
  if (!bestaat) ScriptApp.newTrigger('bijAanvinken').forSpreadsheet(SpreadsheetApp.openById(SHEET_ID)).onEdit().create();
  pBlad();
  SpreadsheetApp.getUi().alert('De knop staat aan. Vink in het tabblad "Partners" bij een partner "Logo-info sturen" aan, dan vertrekt de mail meteen.');
}

function bijAanvinken(e) {
  if (!e || !e.range) return;
  var b = e.range.getSheet();
  if (b.getName() !== P_BLAD || e.range.getColumn() !== PK['Logo-info sturen'] + 1 || e.range.getRow() < 2) return;
  if (e.range.getValue() !== true) return;
  var slot = LockService.getScriptLock(); slot.waitLock(15000);
  try { logoInfoVoorRij(e.range.getRow()); } finally { slot.releaseLock(); }
}

function logoInfoGeselecteerd() {
  var ui = SpreadsheetApp.getUi(), b = SpreadsheetApp.getActiveSheet();
  if (b.getName() !== P_BLAD) { ui.alert('Ga eerst naar het tabblad "Partners" en klik in de rij van de partner.'); return; }
  var nr = b.getActiveRange().getRow();
  if (nr < 2) { ui.alert('Klik in de rij van de partner (niet in de titelrij).'); return; }
  var r = b.getRange(nr, 1, 1, P_KOLOMMEN.length).getDisplayValues()[0];
  var ja = ui.alert('Logo-info sturen?', 'Naar ' + r[PK.Bedrijf] + ' (' + r[PK['E-mail']] + '), pakket ' + (r[PK.Pakket] || '–') + '.', ui.ButtonSet.YES_NO);
  if (ja !== ui.Button.YES) return;
  var uit = logoInfoVoorRij(nr);
  ui.alert(uit.ok ? 'Verstuurd naar ' + r[PK['E-mail']] + '.' : uit.melding);
}

// Stuurt de mail voor één rij en zet status en datum. Geeft { ok, melding } terug.
function logoInfoVoorRij(nr) {
  var b = pBlad(), r = b.getRange(nr, 1, 1, P_KOLOMMEN.length).getDisplayValues()[0];
  var pakket = r[PK.Pakket], mail = String(r[PK['E-mail']]).trim().toLowerCase();
  var fout = function (m) { pSchrijf(nr, { Status: 'Niet verstuurd: ' + m, 'Logo-info sturen': false }); return { ok: false, melding: m }; };
  if (!mailOk(mail)) return fout('geen geldig e-mailadres');
  if (['Bouwsteen', 'Sleuteldrager', 'Hart van Temse', 'Op maat'].indexOf(pakket) < 0) return fout('kies eerst het pakket in de kolom Pakket');
  var code = r[PK.Code] || nieuweCode();
  stuurMail(mail, 'Welkom als partner van WaasUp: dit hebben we van je nodig', logoMailInhoud(r[PK.Naam] || r[PK.Bedrijf], r[PK.Bedrijf], pakket, code));
  pSchrijf(nr, { Code: code, Status: 'Logo-info verstuurd', 'Logo-info sturen': true, 'Logo-info verstuurd op': new Date() });
  SpreadsheetApp.getActive() && SpreadsheetApp.getActive().toast('Logo-info verstuurd naar ' + mail, 'WaasUp', 5);
  return { ok: true };
}

// ---------- Acties vanaf de website (worden opgeroepen vanuit doPost in WaasUp-vrienden.gs) ----------

// Partnerformulier op waasup.be/partners.html
function partnerAanvraag(d) {
  var mail = schoon(d.email, 120).toLowerCase(), bedrijf = schoon(d.bedrijf, 120), naam = schoon(d.naam, 80);
  if (!bedrijf || !naam || !mailOk(mail) || d.toestemming !== 'ja') return { ok: false, fout: 'gegevens' };
  var pakket = PAKKETTEN.indexOf(d.pakket) > -1 ? d.pakket : 'Nog geen idee';
  var code = nieuweCode();
  pVoegToe({ Datum: new Date(), Code: code, Bedrijf: bedrijf, Naam: naam, 'E-mail': mail, Telefoon: schoon(d.telefoon, 30),
    Pakket: pakket, Status: 'Aanvraag ontvangen', 'Logo-info sturen': false, Bron: 'website' });
  stuurMail(mail, 'Bedankt voor je interesse in een partnerschap met WaasUp',
    '<p>Dag ' + html(naam) + ',</p><p>Bedankt om aan WaasUp te denken! We bezorgen je het partnerdossier en nemen binnen twee werkdagen contact op' +
    (pakket !== 'Nog geen idee' ? ' over het pakket <b>' + html(pakket) + '</b>' : '') + '. Liever eerst even praten? Antwoord gewoon op deze mail.</p>');
  stuurMail(ANTWOORD_ADRES, 'Nieuwe partneraanvraag: ' + bedrijf,
    '<p>' + html(naam) + ' van <b>' + html(bedrijf) + '</b> vroeg het partnerdossier aan.</p><p>Pakket: ' + html(pakket) +
    '<br>E-mail: ' + html(mail) + '<br>Telefoon: ' + html(schoon(d.telefoon, 30) || '–') + '</p><p>Staat in het tabblad Partners.</p>');
  return { ok: true };
}

// Bestanden van waasup.be/logo-aanleveren.html
function logoOpladen(d) {
  var code = schoon(d.code, 20).toUpperCase();
  if (!/^P-[A-Z0-9]{6}$/.test(code)) return { ok: false, fout: 'code' };
  var rij = pZoek(function (r) { return r[PK.Code] === code; });
  if (!rij) return { ok: false, fout: 'code' };
  var lijst = Array.isArray(d.bestanden) ? d.bestanden.slice(0, 8) : [];
  if (!lijst.length) return { ok: false, fout: 'bestanden' };
  var TOEGELATEN = /\.(svg|eps|ai|pdf|png|jpe?g|tiff?|zip)$/i;
  var map = partnerMap(rij.r[PK.Bedrijf], code), bewaard = 0;
  lijst.forEach(function (f) {
    var naam = schoon(f.naam, 120).replace(/[\\\/:*?"<>|]/g, '_');
    if (!TOEGELATEN.test(naam) || typeof f.data !== 'string') return;
    var bytes = Utilities.base64Decode(f.data);
    if (bytes.length > 15 * 1024 * 1024) return;
    map.createFile(Utilities.newBlob(bytes, 'application/octet-stream', naam));
    bewaard++;
  });
  if (!bewaard) return { ok: false, fout: 'bestanden' };
  var kleuren = schoon(d.kleuren, 300), tekst = schoon(d.tekst, 1500), opm = schoon(d.opmerking, 800);
  var upd = { Status: 'Logo ontvangen', 'Logo ontvangen op': new Date(), 'Logo-map': map.getUrl() };
  if (kleuren) upd.Kleurcodes = kleuren;
  if (tekst) upd.Voorstelling = tekst;
  if (opm) upd.Notities = (rij.r[PK.Notities] ? rij.r[PK.Notities] + ' | ' : '') + 'Partner: ' + opm;
  pSchrijf(rij.nr, upd);
  stuurMail(rij.r[PK['E-mail']], 'Goed ontvangen: je logo voor WaasUp',
    '<p>Dag ' + html(rij.r[PK.Naam] || rij.r[PK.Bedrijf]) + ',</p><p>We kregen ' + bewaard + (bewaard === 1 ? ' bestand' : ' bestanden') +
    ' goed binnen. We kijken alles na en laten het weten als er nog iets ontbreekt. Bedankt om mee te bouwen aan Temse!</p>');
  stuurMail(ANTWOORD_ADRES, 'Logo ontvangen: ' + rij.r[PK.Bedrijf],
    '<p><b>' + html(rij.r[PK.Bedrijf]) + '</b> (' + html(rij.r[PK.Pakket]) + ') laadde ' + bewaard + ' bestand(en) op.</p>' +
    '<p><a href="' + map.getUrl() + '">Open de map in Google Drive</a></p>' + (kleuren ? '<p>Kleurcodes: ' + html(kleuren) + '</p>' : '') +
    (opm ? '<p>Opmerking: ' + html(opm) + '</p>' : ''));
  return { ok: true, aantal: bewaard };
}

// ---------- De mail met de aanleverrichtlijnen ----------

function logoMailInhoud(aanspreking, bedrijf, pakket, code) {
  var link = SITE + '/logo-aanleveren.html?c=' + code + '#' + pakketAnker(pakket);
  var h3 = function (t) { return '<p style="font-size:17px;font-weight:800;margin:24px 0 6px">' + t + '</p>'; };
  var lijst = function (items) { return '<ul style="margin:0;padding-left:20px">' + items.map(function (i) { return '<li style="margin:4px 0">' + i + '</li>'; }).join('') + '</ul>'; };
  var extra = [];
  if (pakket === 'Bouwsteen' || pakket === 'Op maat') extra.push('Wat je in natura geeft, met de geschatte waarde (zodat we je juist kunnen bedanken).');
  if (pakket === 'Sleuteldrager' || pakket === 'Hart van Temse' || pakket === 'Op maat') {
    extra.push('Een korte voorstelling van je zaak (3 à 5 zinnen) voor de nieuwsbrief en je eigen posts.');
    extra.push('3 tot 5 foto\'s van je zaak, team of producten (liggend, minstens 1920 px breed), die we mogen gebruiken.');
    extra.push('Je spandoek: breng het mee of bezorg het ons een week voor de activiteit (liefst met ringen om op te hangen, max. 3 m breed).');
  }
  if (pakket === 'Hart van Temse' || pakket === 'Op maat') {
    extra.push('Een <b>eenkleurige</b> versie van je logo (wit of zwart, zonder verlopen of schaduw) voor de T-shirts van de vrijwilligers.');
    extra.push('Welke activiteit je naam draagt, en wat je nodig hebt voor je standje (stroom, tafel, tent).');
  }
  return '<p>Dag ' + html(aanspreking) + ',</p>' +
    '<p>Fijn dat <b>' + html(bedrijf) + '</b> partner wordt van WaasUp met het pakket <b>' + html(pakket) + '</b>! ' +
    'Om je zichtbaar te maken op de site, op affiches en ter plaatse hebben we een paar dingen van je nodig. Bezorg ze ' + LOGO_TERMIJN + '.</p>' +
    '<p><a href="' + link + '" style="display:inline-block;background:#FDB112;color:#011737;font-weight:800;text-decoration:none;padding:14px 26px;border-radius:999px">Laad je logo en materiaal op</a></p>' +
    h3('1. Je logo') + lijst([
      '<b>Liefst als vectorbestand</b>: .svg, .ai, .eps of .pdf, met de letters omgezet naar lijnen (outlines). Dat blijft scherp op elk formaat, van website tot spandoek.',
      'Geen vectorbestand? Dan een <b>.png met transparante achtergrond</b> van minstens <b>3000 pixels</b> aan de langste kant.',
      'Graag drie versies: <b>in kleur</b>, <b>wit</b> (voor onze donkerblauwe achtergronden) en <b>zwart</b>.',
      'Geen logo\'s uit een e-mailhandtekening, van je website of als screenshot: die zijn te klein en worden wazig.'
    ]) +
    h3('2. Pixels en DPI, kort uitgelegd') + lijst([
      '<b>Voor de website</b> telt alleen het aantal pixels: minstens 1000 px breed.',
      '<b>Voor drukwerk</b> (affiches, flyers, bedankbord) rekenen drukkers met <b>300 DPI</b> op het echte formaat. Een logo van 10 cm breed = minstens 1200 px.',
      '<b>Voor grote formaten</b> (spandoek, bord) volstaat 100 à 150 DPI op het echte formaat, maar een vectorbestand is daar echt het beste.'
    ]) +
    h3('3. Je kleuren') + lijst([
      '<b>HEX of RGB</b> voor scherm (bv. #011737).',
      '<b>CMYK</b> voor drukwerk, en je <b>Pantone</b>-nummer als je dat hebt.',
      'Heb je een huisstijlgids? Stuur hem gerust mee, dan zitten we altijd juist.'
    ]) +
    (extra.length ? h3('4. Extra voor je pakket ' + html(pakket)) + lijst(extra) : '') +
    h3((extra.length ? '5' : '4') + '. Even nakijken') + lijst([
      'De juiste schrijfwijze van je bedrijfsnaam, je website en je sociale media (zodat we je kunnen taggen).',
      'Bestandsnamen zoals <i>bedrijfsnaam_logo_kleur.svg</i>, <i>…_wit.png</i>, <i>…_zwart.png</i> helpen ons veel.'
    ]) +
    '<p style="margin-top:22px">Lukt het opladen niet? Antwoord dan gewoon op deze mail met de bestanden in bijlage (of een WeTransfer-link). ' +
    'Twijfel je over een bestand? Stuur wat je hebt, we kijken het samen na.</p><p>Je partnercode: <b>' + code + '</b></p>';
}

// ---------- Hulpjes ----------

function pBlad() {
  var ss = SpreadsheetApp.openById(SHEET_ID), b = ss.getSheetByName(P_BLAD);
  if (!b) {
    b = ss.insertSheet(P_BLAD);
    b.appendRow(P_KOLOMMEN); b.setFrozenRows(1);
    b.getRange(1, 1, 1, P_KOLOMMEN.length).setFontWeight('bold').setBackground('#011737').setFontColor('#ffffff');
    b.getRange(1, PK['Logo-info sturen'] + 1).setBackground('#FDB112').setFontColor('#011737');
    b.getRange(2, PK.Pakket + 1, 999, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(PAKKETTEN, true).build());
    b.getRange(2, PK['Logo-info sturen'] + 1, 999, 1).insertCheckboxes();
    b.setColumnWidth(PK.Bedrijf + 1, 180); b.setColumnWidth(PK.Status + 1, 200);
  }
  return b;
}
function pVoegToe(rij) {
  var b = pBlad();
  b.appendRow(P_KOLOMMEN.map(function (n) { return n === 'Logo-info sturen' ? false : veilig(rij[n], n); }));
  b.getRange(b.getLastRow(), PK['Logo-info sturen'] + 1).insertCheckboxes();
}
function pSchrijf(nr, rij) {
  var b = pBlad();
  Object.keys(rij).forEach(function (n) {
    if (PK[n] === undefined) return;
    var v = rij[n]; b.getRange(nr, PK[n] + 1).setValue(v instanceof Date || typeof v === 'boolean' ? v : veilig(v, n));
  });
}
function pZoek(test) {
  var b = pBlad(), n = b.getLastRow();
  if (n < 2) return null;
  var rijen = b.getRange(2, 1, n - 1, P_KOLOMMEN.length).getDisplayValues();
  for (var i = rijen.length - 1; i >= 0; i--) if (test(rijen[i])) return { nr: i + 2, r: rijen[i] };
  return null;
}
function partnerMap(bedrijf, code) {
  var it = DriveApp.getFoldersByName(LOGO_MAP), hoofd = it.hasNext() ? it.next() : DriveApp.createFolder(LOGO_MAP);
  var naam = schoon(bedrijf, 80).replace(/[\\\/:*?"<>|]/g, '_') + ' (' + code + ')';
  var sub = hoofd.getFoldersByName(naam);
  return sub.hasNext() ? sub.next() : hoofd.createFolder(naam);
}
function nieuweCode() {
  var tekens = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', r;
  do { r = 'P-'; for (var i = 0; i < 6; i++) r += tekens.charAt(Math.floor(Math.random() * tekens.length)); }
  while (pZoek(function (x) { return x[PK.Code] === r; }));
  return r;
}
function pakketAnker(p) { return { 'Bouwsteen': 'bouwsteen', 'Sleuteldrager': 'sleuteldrager', 'Hart van Temse': 'hart-van-temse' }[p] || 'alles'; }
