# Impact Energy Intake Webapp - Volledige Gids

## 1. Doel van deze applicatie

Deze webapp is een intake-tool voor Impact Energy.
Impact Energy is **geen energieleverancier**. De app verzamelt aansluitdata zodat Impact Energy daarna energiebeheer kan doen (contracten, kosten, verbruik, optimalisatie).

Kernidee:
- klant uploadt documenten (foto, PDF, Excel) of vult handmatig in
- app probeert velden automatisch te herkennen
- klant controleert en corrigeert
- klant exporteert data naar Excel, CSV of PDF

Deze app is gemaakt voor niet-technische gebruikers:
- grote knoppen
- simpele stappen
- duidelijke foutmeldingen in gewone taal

---

## 2. Wat de app wel en niet doet

Wat de app wel doet:
- OCR op foto en PDF
- Excel import met kolomherkenning
- validatie van verplichte velden
- lokale opslag in browser (IndexedDB, met localStorage fallback)
- export naar Excel, CSV en PDF

Wat de app niet doet:
- geen marktpartij-check of EAN echt bestaat
- geen automatische verificatie bij netbeheerder-portalen
- standaard geen centrale backend/database

Belangrijk:
- veld `Leverancier` wordt **niet** automatisch gevuld met "Impact Energy"

---

## 3. Technische stack

Frontend:
- React 19
- Vite
- TypeScript
- Tailwind CSS
- React Router

Documentverwerking:
- `tesseract.js` (OCR)
- `pdfjs-dist` (PDF pagina's renderen)
- `xlsx` (Excel lezen/schrijven)
- `jspdf` (PDF export)

Testing:
- Vitest

---

## 4. Projectstructuur

Belangrijkste mappen:

- `src/pages`
- `src/components`
- `src/services`
- `src/models`
- `src/utils`
- `src/contexts`

Belangrijkste bestanden:

- `src/App.tsx`
- `src/pages/HomePage.tsx`
- `src/pages/UploadPage.tsx`
- `src/pages/OcrPreviewPage.tsx`
- `src/pages/ReviewPage.tsx`
- `src/pages/OverviewPage.tsx`
- `src/pages/ConnectionDetailPage.tsx`
- `src/pages/ExportPage.tsx`
- `src/models/connection.ts`
- `src/services/ocrService.ts`
- `src/services/extractorService.ts`
- `src/services/extractionProviderService.ts`
- `src/services/storageService.ts`
- `src/services/exportService.ts`
- `src/utils/validation.ts`

---

## 5. UX flow voor eindgebruikers

### 5.1 Home (`/`)
Home bevat alleen acties:
- Upload documenten
- Handmatig toevoegen
- Overzicht
- Export
- Reset (kleiner onderaan)

Er staan op Home geen uploadvelden.

### 5.2 Upload (`/upload`)
Uploadpagina bevat 1 grote knop:
- `Upload bestanden`

De gebruiker mag tegelijk kiezen:
- foto (`jpg`, `png`, `heic`)
- PDF
- Excel (`xlsx`, `xls`)

De app sorteert automatisch:
- Foto -> OCR image flow
- PDF -> OCR pdf flow
- Excel -> import flow

Na selectie ziet gebruiker simpele telling:
- X foto's
- Y PDF's
- Z Excel-bestanden

Daarna:
- knop `Start verwerking`

### 5.3 Detectie (`/ocr-preview`)
Per bestand is progress zichtbaar in gewone taal:
- Bezig met lezen
- Bezig met OCR
- Bezig met extractie
- Klaar

Foutmeldingen zijn gebruiker-vriendelijk:
- "Dit bestand kunnen we niet lezen: ... Probeer een scherpere foto of scan."

### 5.4 Controle (`/controle`)
Gedetecteerde aansluitingen kunnen per stuk aangepast/verwijderd worden.
Validatiefouten worden rood getoond.

### 5.5 Overzicht (`/overzicht`)
Alle records samen.
Badges:
- `Compleet`
- `Incompleet (X)`

### 5.6 Detail (`/aansluiting/:id`)
Volledig formulier voor handmatige toevoeging of correctie.

### 5.7 Export (`/export`)
Export naar:
- Excel
- CSV
- PDF

Extra:
- duidelijke waarschuwing bij incomplete data
- `Deel laatste export` via Web Share als device/browser dat ondersteunt

---

## 6. Datamodel

Definitie staat in `src/models/connection.ts`.

Belangrijke velden:
- `eanCode`
- `product`
- `tenaamstelling`
- `kvkNumber`
- `iban`
- `authorizedSignatory`
- `telemetryCode`
- `telemetryType` (optioneel)
- leveringsadres:
- `deliveryPostcode`
- `deliveryHouseNumber`
- `deliveryStreet`
- `deliveryCity`
- factuuradres:
- `invoiceSameAsDelivery`
- `invoicePostcode`
- `invoiceHouseNumber`
- `invoiceStreet`
- `invoiceCity`
- `marketSegment`
- `gridOperator`
- `supplier`
- `meterNumber`
- `addressWarning`
- `source`

Verplichte velden:
- EAN
- Product
- Tenaamstelling
- KvK
- IBAN
- Tekenbevoegde
- Telemetriecode / Meetcode (ONBEKEND mag)
- Leveringsadres (postcode, huisnummer, straat, plaats)
- Marktsegment

Keuzelijsten:
- Product: `Elektra`, `Gas`, `Water`, `Warmte`, `Onbekend`
- Marktsegment: `KV`, `GV`, `Onbekend`
- Telemetrie type (optioneel): `Onbekend`, `Slimme meter`, `Maandbemeten`, `Jaarbemeten`, `Continu (kwartierwaarden)`

---

## 7. Validatie

Validatie staat in `src/utils/validation.ts`.

Regels:
- EAN moet exact 18 cijfers zijn (spaties worden genegeerd)
- Postcode NL/BE geldig:
- NL: `1234 AB` (met of zonder spatie)
- BE: `1234`
- KvK: 8 cijfers
- IBAN: modulo-97 validatie (NL/BE en andere standaard-IBANs)
- Factuuradres velden verplicht als `invoiceSameAsDelivery = false`

OCR-specifieke melding bij postcode-fout:
- "Postcode lijkt verkeerd herkend, controleer."

Waarschuwingen (niet blokkeren):
- product `Onbekend`
- marktsegment `Onbekend`
- adres twijfel (`addressWarning`)

Confidence-indicator per veld:
- `laag`
- `midden`
- `hoog`

Deze wordt bepaald op basis van:
- bron (`MANUAL`/`EXCEL` hoger)
- bestaande fouten
- adreswaarschuwing

---

## 8. OCR en extractie

### 8.1 Lokale OCR

`src/services/ocrService.ts`:
- tesseract worker met `nld+eng`
- image preprocessing:
- EXIF-orientatie (waar mogelijk)
- grayscale
- contrastverhoging
- resize naar max dimensie

### 8.2 PDF-regel: altijd 1 aansluiting

PDF-flow:
- alle pagina's OCR
- tekst samenvoegen
- 1 extractie-resultaat per PDF

In code wordt dat afgedwongen met:
- `allowMultiple: false`
- `splitMode: 'none'`

### 8.3 Extractorregels

`src/services/extractorService.ts`:
- label/value parsing
- alias mapping
- fuzzy label matching (Levenshtein)
- patroonherkenning:
- EAN
- postcode
- product
- marktsegment
- telemetriecode
- telemetrie type

Adresselectie:
- prioriteit op labels als:
- `Leveringsadres`, `Aansluitadres`, `Adres aansluiting`
- `Factuuradres`
- regels om leverancier/adres afzender te vermijden:
- lijnen met `Leverancier`, `Netbeheerder`, `Afzender` worden niet als leveringsadres geprefereerd

Bij twijfel:
- veld `addressWarning` wordt gezet
- UI toont waarschuwing

### 8.4 Netbeheerder

In het formulier:
- vaste lijst netbeheerders
- optie `Anders (zelf invullen)`
- dan verschijnt direct tekstveld
- waarde wordt opgeslagen

---

## 9. AI extract provider (optionele backend-route)

Standaard werkt app volledig client-side (`localOCR`).

Optioneel kan je AI-route aanzetten:
- `VITE_EXTRACT_PROVIDER=aiExtract`
- `VITE_AI_EXTRACT_ENDPOINT=/api/extract` (of absolute URL naar je serverless endpoint)
- serverless env var: `OPENAI_API_KEY`
- optioneel serverless env var: `OPENAI_MODEL` (standaard `gpt-4.1-mini`)

Serverless endpoint:
- `api/extract.ts`
- bevat rate limiting + payload limieten
- gebruikt OpenAI Responses API
- forceert PDF naar exact 1 aansluiting
- verwijdert `supplier = Impact Energy` als AI dit ten onrechte invult

Provider-architectuur staat in:
- `src/services/extractionProviderService.ts`

Ondersteunde payload types richting endpoint:
- `inputType: "image"` met `imageDataUrl`
- `inputType: "pdf_pages"` met `pages[]` (data URLs)
- `inputType: "text"` met ruwe tekst

Verwachte endpoint response:
- `connection` of `connections`
- optioneel `warning`

Voorbeeld response:

```json
{
  "connections": [
    {
      "eanCode": "123456789012345678",
      "product": "Elektra",
      "tenaamstelling": "Voorbeeld BV"
    }
  ],
  "warning": "Lage OCR-kwaliteit op pagina 3"
}
```

Fallback gedrag:
- als AI-endpoint faalt of ontbreekt, valt app automatisch terug op lokale OCR/extractie

Privacy-aanpak voor serverless endpoint:
- verwerk request in-memory
- log geen documentinhoud
- sla bestanden niet permanent op
- verwijder tijdelijke data direct na extractie

---

## 10. Opslag en multi-user gedrag

Opslag staat in:
- `src/services/storageService.ts`

Gedrag:
- primair `IndexedDB`
- fallback `localStorage`

Belangrijk voor business:
- data staat lokaal in 1 browser op 1 apparaat
- andere klanten op andere apparaten zien die data niet
- meerdere gebruikers op exact hetzelfde device/browser-profiel delen wel dezelfde lokale opslag

Conclusie:
- goed voor eenvoudige intake
- voor echte multi-tenant organisatie-opslag is later een backend nodig

---

## 11. Export

Service:
- `src/services/exportService.ts`

Ondersteund:
- Excel (`.xlsx`)
- CSV (`.csv`)
- PDF (`.pdf`)

Gedrag:
- export mag doorgaan met incomplete records na confirm
- PDF bevat Impact Energy branding in de kop
- `Deel laatste export` gebruikt Web Share API als ondersteund

---

## 12. Routing overzicht

Routes in `src/App.tsx`:
- `/` -> Home
- `/upload` -> Upload
- `/ocr-preview` -> Detectie
- `/controle` -> Controle
- `/overzicht` -> Overzicht
- `/aansluiting/:id` -> Detail
- `/export` -> Export

---

## 13. Lokale development

Installatie:

```bash
npm install
```

Development:

```bash
npm run dev
```

Tests:

```bash
npm test -- --run
```

Build:

```bash
npm run build
```

Build output:
- `dist/`

---

## 14. Deploy (statisch, InfinityFree/Vercel/Netlify)

Voor statische hosting:
- upload de inhoud van `dist/`
- dit werkt met lokale OCR (`VITE_EXTRACT_PROVIDER=localOCR`)

Voor InfinityFree:
- plaats inhoud van `dist/` in `htdocs/`
- `.htaccess` in `public/.htaccess` zorgt voor SPA rewrites + juiste `.mjs` MIME type

Voor AI extractie:
- je hebt serverless functies nodig (bijv. Vercel/Netlify)
- zet `OPENAI_API_KEY` op de server (niet in frontend)
- endpoint `api/extract.ts` moet bereikbaar zijn op `/api/extract`

---

## 15. PWA status

Huidige status:
- app is mobile-first en werkt als webapp
- maar er is nu nog geen actieve service worker/manifest-config in de codebase

Voor volledige PWA ("Add to Home Screen" + offline caching):
- voeg manifest toe
- voeg service worker toe (bijv. via `vite-plugin-pwa`)

---

## 16. Bekende beperkingen en verbeterpunten

Huidige beperkingen:
- OCR op slechte foto's blijft gevoelig
- geen echte document-layout-analyse
- geen centrale gebruikersaccounts
- geen backend audittrail

Aanbevolen volgende stappen:
- PWA afronden
- centrale backend met auth en tenant-isolatie
- betere OCR preprocessing (deskew/denoise)
- geavanceerde AI-veldconfidence per attribuut
- import templates per leverancier/netbeheerder

---

## 17. Korte samenvatting voor opdrachtgever

De intake-app is nu bruikbaar als productiegerichte webapp voor eenvoudige, snelle data-aanlevering:
- simpele uploadflow
- automatische herkenning
- controle door gebruiker
- duidelijke validatie
- exportmogelijkheden

De app draait standaard volledig client-side.
Voor hogere extractiekwaliteit is een optionele serverless AI-route voorbereid zonder harde afhankelijkheid.
