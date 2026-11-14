# WaasUp vrienden-server installeren (eenmalig, ±10 minuten)

1. Maak in Google Drive een nieuwe Google Sheet: **WaasUp Vrienden**.
2. Menu **Extensies › Apps Script**. Wis wat er staat en plak de volledige inhoud van `WaasUp-vrienden.gs`. Klik op 💾 Opslaan.
3. Rechtsboven **Implementeren › Nieuwe implementatie**. Kies bij het tandwiel **Web-app**.
   - Uitvoeren als: **Ik**
   - Wie heeft toegang: **Iedereen**
4. Klik **Implementeren** en geef toestemming (Google vraagt om Sheets en Mail te mogen gebruiken).
5. Kopieer de **Web-app-URL** (eindigt op `/exec`) en geef die aan Claude. Die komt in `assets/app-config.js`.

Het tabblad "Vrienden" verschijnt vanzelf bij de eerste inschrijving.
Mails vertrekken van het Google-account waarmee je dit installeert, met als naam "WaasUp" en antwoorden naar info@waasup.be.
Gratis limiet: ±100 mails per dag (gewoon Gmail-account).

## Partners: logo-info met één klik (tweede bestand)

1. Open de Sheet **WaasUp Vrienden** › **Extensies › Apps Script**.
2. Vervang de inhoud van het bestaande bestand door de nieuwe `WaasUp-vrienden.gs` (er kwamen 2 regels bij).
3. Klik links op **+ › Script**, noem het `WaasUp-partners` en plak de volledige inhoud van `WaasUp-partners.gs`. 💾 Opslaan.
4. **Implementeren › Implementaties beheren** › potloodje › Versie: **Nieuwe versie** › **Implementeren**.
   Zo blijft de webadres-URL dezelfde. Google vraagt één keer extra toestemming voor **Google Drive** (om de logo's te bewaren).
5. Herlaad de Sheet. Bovenaan verschijnt het menu **WaasUp**. Kies één keer **Knop activeren (eenmalig)**.

Gebruik:
- Partneraanvragen van waasup.be komen vanzelf in het tabblad **Partners**.
- Kiest een partner een pakket: zet het pakket in de kolom **Pakket** en vink **Logo-info sturen** aan (werkt ook in de Sheets-app op je gsm).
  Of: klik in de rij en kies **WaasUp › Logo-info sturen naar geselecteerde partner** (vraagt eerst bevestiging).
- De partner krijgt een mail met de richtlijnen voor zijn pakket en een persoonlijke link naar `waasup.be/logo-aanleveren.html`.
- Opgeladen bestanden komen in Google Drive, map **WaasUp Partnerlogo's**, per partner een eigen map. De status wordt **Logo ontvangen**.
- Een partner die je zelf toevoegt (telefoon, langs geweest): vul een nieuwe rij in met Bedrijf, Naam, E-mail en Pakket, en vink aan. De code wordt dan vanzelf aangemaakt.
