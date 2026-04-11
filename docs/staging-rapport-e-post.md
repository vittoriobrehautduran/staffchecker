# Staging: annan mottagare för rapportmejl (val 2)

Produktion anropar `POST …/submit-report` → Lambda `timrapport-submit-report` → `BOSS_EMAIL_ADDRESS` (chef).

Staging ska anropa `POST …/submit-report-staging` → Lambda `timrapport-submit-report-staging` → **annan** `BOSS_EMAIL_ADDRESS` (t.ex. din testmejl).

## 1. Kod (klar i repot)

- `VITE_REPORT_SUBMIT_PATH` styr sökvägssegmentet. **Standard (tom)** = `submit-report` → samma beteende som tidigare.
- Staging-build sätter `VITE_REPORT_SUBMIT_PATH=submit-report-staging`.
- Ny Lambda-källa: `lambda/submit-report-staging.ts` (samma logik som `submit-report.ts`).

## 2. Bygg och deploy av Lambdas

```bash
npm run build:lambda
npm run deploy:lambda
```

Första gången skapas `timrapport-submit-report-staging` om den saknas (samma roll som övriga lambdas om `LAMBDA_ROLE_ARN` eller befintlig funktion hittas).

## 3. Miljövariabler för staging-Lambdan

```bash
npm run set-lambda-env
```

`npm run set-lambda-env` uppdaterar **inte** `BOSS_EMAIL_ADDRESS` på **`timrapport-submit-report`** (prod) — den adressen ska du sätta en gång i **AWS Console** och låta vara.

För **`timrapport-submit-report-staging`** sätter skriptet chef-mejl från `.env.local`:

- **`BOSS_EMAIL_ADDRESS_STAGING`** (rekommenderat, testinkorg), eller
- **`BOSS_EMAIL_ADDRESS`** om staging-variabeln saknas.

Övriga e-postfält (SES-region, nycklar) uppdateras från `.env.local` för **båda** rapport-Lambdorna.

## 4. API Gateway (du gör i AWS Console)

1. Öppna samma **REST API** som idag har `POST /submit-report`.
2. Skapa resurs **`submit-report-staging`** (eller annat namn — måste då matcha `VITE_REPORT_SUBMIT_PATH`).
3. Lägg **`POST`** på den resursen:
   - **Integration:** Lambda `timrapport-submit-report-staging`
   - **Lambda proxy** / samma stil som befintlig `POST /submit-report`
4. **Authorization:** samma som för `submit-report` (t.ex. Cognito authorizer om du använder det).
5. **Deploy** API till stage (**prod** eller det stage du använder i `VITE_API_BASE_URL`).
6. **CORS:** om du använder OPTIONS på `submit-report`, gör motsvarande för `submit-report-staging` (eller samma CORS-setup som övriga routes).

Verifiera med curl/Postman: `POST https://<din-api-url>/submit-report-staging` med samma headers som prod.

## 5. Amplify (staging-gren)

**App settings → Environment variables** → välj **staging branch**:

| Variabel | Värde |
|----------|--------|
| `VITE_REPORT_SUBMIT_PATH` | `submit-report-staging` |

**Production branch:** sätt **inte** variabeln (eller sätt uttryckligen `submit-report`).

Övriga `VITE_*` (API URL, Cognito) kan vara **samma** som prod om du bara vill ändra rapportmejl — då delar du fortfarande **samma databas** för allt utom denna route.

## 6. Efter ändring

Trigga **ombyggnad** av staging i Amplify så `VITE_REPORT_SUBMIT_PATH` följer med i klienten.

## Checklista

- [ ] `timrapport-submit-report-staging` finns i Lambda med rätt `BOSS_EMAIL_ADDRESS`
- [ ] `POST /submit-report-staging` pekar på den Lambdan
- [ ] API deployad
- [ ] Amplify staging har `VITE_REPORT_SUBMIT_PATH=submit-report-staging`
- [ ] Prod branch **utan** den variabeln (eller `submit-report`)
