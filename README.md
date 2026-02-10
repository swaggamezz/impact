# Impact Energy Intake Webapp

Mobile-first PWA intake-tool voor Impact Energy (consultant, geen leverancier).

## Stack
- React + Vite + TypeScript + Tailwind
- OCR: `tesseract.js` + `pdfjs-dist`
- Import/export: `xlsx` + `jspdf`
- Opslag: IndexedDB (fallback localStorage)

## Belangrijkste routes
- `/` Home (alleen acties)
- `/upload` upload-bestanden
- `/ocr-preview` verwerking/progress
- `/controle` OCR review
- `/connections` overzicht
- `/connections/:id` detail bewerken
- `/export` export

## Starten
```bash
npm install
npm run dev
```

## Build/Test
```bash
npm test
npm run build
```

## AI Extractie (serverless)
De frontend kan lokaal OCR doen (`localOCR`) of AI extractie (`aiExtract`).

### 1) Frontend env
Gebruik `.env.example` als basis.

```env
VITE_EXTRACT_PROVIDER=aiExtract
VITE_AI_EXTRACT_ENDPOINT=/api/extract
```

### 2) Serverless env (NIET in frontend)
Zet op je host (bijv. Vercel/Netlify):

```env
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-4.1-mini
```

### 3) Endpoint
Serverless endpoint staat in:
- `api/extract.ts`

Kenmerken:
- PDF wordt altijd 1 aansluiting
- rate limit + payload limieten
- fallback naar lokale OCR als AI faalt
- `supplier` wordt nooit automatisch `Impact Energy`

## Deploy

### Statisch (zonder AI endpoint)
Upload `dist/` naar static hosting.

### Met AI endpoint
Gebruik een platform met serverless functies (bijv. Vercel/Netlify), zodat `/api/extract` beschikbaar is.

## Uitgebreide documentatie
Zie:
- `docs/IMPACT_ENERGY_WEBAPP_GIDS.md`
