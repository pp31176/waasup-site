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
