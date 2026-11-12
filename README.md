# waasup-site

Website van WaasUp vzw: www.waasup.be

Statische site, gehost op statichost.eu (Europese infrastructuur).

## Laatste nieuws van Instagram

Op de homepage (blok "In beeld") verschijnen automatisch de 6 nieuwste posts van Instagram (@waasup9140).
Je post via Buffer naar Facebook, Instagram en TikTok; de site haalt elk uur de Instagram-posts op.

- `scripts/haal-instagram.mjs` haalt de posts op en bewaart tekst + foto **op de site zelf** (geen cookies of tracking van Meta).
- `.github/workflows/instagram.yml` draait dat script elk uur (of manueel via het tabblad *Actions* → *Run workflow*).
- Nodig in GitHub → *Settings* → *Secrets and variables* → *Actions*: `IG_TOKEN` en `IG_USER_ID`. Zolang die ontbreken blijft het blok verborgen en zie je de Temse-foto's.
- Voorbeeld bekijken zonder echte posts: zet `?voorbeeld` achter het adres, bv. `waasup.be/?voorbeeld`.
