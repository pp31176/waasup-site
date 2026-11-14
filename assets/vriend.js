// WaasUp – vriend worden: dezelfde werking in de app (lidkaart.html) en op de website (doe-mee.html).
// De kaart staat meteen op het toestel; de inschrijving gaat automatisch naar WaasUp (Google Sheet + welkomstmail).
// Lukt het doorsturen niet (geen internet), dan blijft ze in een wachtrij en gaat ze vanzelf bij het volgende bezoek.
(function () {
  var SLEUTEL = 'waasup-vriendenkaart', WACHT = 'waasup-wachtrij';
  var API = (window.WAASUP_API || '').trim();
  function lsLees(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function lsZet(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function b64url(s) { return btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }

  function nummer() {
    var tekens = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', r = '', d = new Date();
    var buf = new Uint32Array(4); (window.crypto || window.msCrypto).getRandomValues(buf);
    for (var i = 0; i < 4; i++) r += tekens.charAt(buf[i] % tekens.length);
    return 'WU-' + String(d.getFullYear()).slice(2) + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + r;
  }
  // "leen en lotte; mats" -> "Leen, Lotte, Mats"
  function namen(t) {
    return String(t || '').split(/\s*(?:,|;|\/|&|\+|\ben\b|\band\b|\bet\b|\n)\s*/i).map(function (x) {
      x = x.replace(/\s+/g, ' ').trim();
      return x ? x.charAt(0).toUpperCase() + x.slice(1) : '';
    }).filter(Boolean).join(', ');
  }
  function geldigTot() { return (new Date().getFullYear() + 1) + '-12-31'; }
  function link(k) { return location.origin + '/lidkaart.html#k=' + b64url(JSON.stringify(k)); }

  function api(actie, data) {
    if (!API) return Promise.reject(new Error('geen-api'));
    data = data || {}; data.actie = actie;
    return fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(data) })
      .then(function (r) { return r.json(); })
      .then(function (j) { if (!j || !j.ok) throw new Error((j && j.fout) || 'fout'); return j; });
  }

  // Inschrijving doorsturen. Geeft de definitieve kaart terug (bestaat het e-mailadres al, dan de bestaande kaart).
  function verstuur(g) {
    return api('inschrijven', g).then(function (j) {
      var rij = (lsLees(WACHT) || []).filter(function (x) { return x.kaart.n !== g.kaart.n; });
      lsZet(WACHT, rij.length ? rij : null);
      var kaart = j.kaart || g.kaart;
      var huidig = lsLees(SLEUTEL);
      if (!huidig || huidig.n === g.kaart.n) lsZet(SLEUTEL, kaart);
      return { kaart: kaart, bestond: !!j.bestond };
    });
  }

  // g = { kaart:{v,a,vo,ki,gl}, email, gsm, straat, rol:'vriend'|'allebei', bron, taal }
  function inschrijven(g) {
    g.kaart.n = g.kaart.n || nummer();
    g.kaart.g = g.kaart.g || geldigTot();
    g.kaart.gl = namen(g.kaart.gl);
    g.link = link(g.kaart);
    lsZet(SLEUTEL, g.kaart);
    var rij = (lsLees(WACHT) || []).filter(function (x) { return x.kaart.n !== g.kaart.n; });
    rij.push(g); lsZet(WACHT, rij);
    return verstuur(g);
  }

  // Openstaande inschrijvingen opnieuw proberen
  function wachtrij() {
    var rij = lsLees(WACHT) || [];
    return Promise.all(rij.map(function (g) { return verstuur(g).catch(function () {}); }));
  }
  if (API && navigator.onLine !== false) setTimeout(wachtrij, 800);
  window.addEventListener('online', function () { wachtrij(); });

  window.WaasUpVriend = { nummer: nummer, namen: namen, geldigTot: geldigTot, link: link, api: api,
    inschrijven: inschrijven, wachtrij: wachtrij, wachtend: function () { return (lsLees(WACHT) || []).length; } };
})();
