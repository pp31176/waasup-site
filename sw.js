// WaasUp-app: zorgt dat de vriendenkaart ook zonder internet opent.
// Verhoog VERSIE bij elke wijziging aan de app-bestanden.
var VERSIE = 'waasup-app-v6';
var BESTANDEN = [
  '/lidkaart.html',
  '/assets/site.css',
  '/assets/site.js',
  '/assets/app-config.js',
  '/assets/vriend.js',
  '/assets/vendor/qrcode.js',
  '/assets/fonts/montserrat-latin-400-normal.woff2',
  '/assets/fonts/montserrat-latin-600-normal.woff2',
  '/assets/fonts/montserrat-latin-700-normal.woff2',
  '/assets/fonts/montserrat-latin-800-normal.woff2',
  '/assets/fonts/permanent-marker-latin-400-normal.woff2',
  '/images/vos-sleutel.png',
  '/images/hondenwandeling.png',
  '/images/app/icoon-192.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSIE).then(function (c) { return c.addAll(BESTANDEN); }));
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (namen) {
    return Promise.all(namen.filter(function (n) { return n !== VERSIE; }).map(function (n) { return caches.delete(n); }));
  }));
  self.clients.claim();
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  // Pagina's: eerst het netwerk (altijd de nieuwste versie), anders de bewaarde kaart
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(function () {
      return caches.match(req, { ignoreSearch: true }).then(function (r) { return r || caches.match('/lidkaart.html'); });
    }));
    return;
  }
  // Instellingen: altijd eerst de nieuwste versie
  if (/app-config\.js$/.test(new URL(req.url).pathname)) {
    e.respondWith(fetch(req).then(function (r) {
      var kopie = r.clone(); caches.open(VERSIE).then(function (c) { c.put(req, kopie); }); return r;
    }).catch(function () { return caches.match(req); }));
    return;
  }
  // Rest: bewaarde versie, en ondertussen bijwerken
  e.respondWith(caches.match(req).then(function (bewaard) {
    var netwerk = fetch(req).then(function (r) {
      if (r.ok) { var kopie = r.clone(); caches.open(VERSIE).then(function (c) { c.put(req, kopie); }); }
      return r;
    }).catch(function () { return bewaard; });
    return bewaard || netwerk;
  }));
});
