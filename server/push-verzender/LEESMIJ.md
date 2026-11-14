# Push-verzender WaasUp (Scaleway, Parijs)

Verstuurt de pushmeldingen van de WaasUp-app. Bewaart zelf niets.

## Eenmalig installeren
1. Maak een account op console.scaleway.com (dat doet Peter zelf).
2. Serverless › Functions › namespace **waasup** in regio **Paris (fr-par)**.
3. Nieuwe functie **push**: runtime **Node 22**, handler **handler.handle**, privacy **public**, geheugen 128 MB, min. schaal 0.
4. Code: plak `handler.js` in de inline editor (of upload `push-verzender.zip`).
5. Geheime omgevingsvariabele **WAASUP_GEHEIM**: het geheim uit `pushInstellen()` van de vrienden-server.
6. Na het deployen: kopieer het adres van de functie naar `PUSH_URL` (vrienden-server) en `WAASUP_PUSH` (assets/app-config.js).

Test: open `<adres>/sleutel` in de browser. Je ziet `{"ok":true,"sleutel":"B..."}`.
