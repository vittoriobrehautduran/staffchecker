# Personuppgifter, underbiträden och teknisk säkerhet (Scaldus / Staffcheck)

Detta dokument beskriver **hur systemet faktiskt är byggt** i detta repo (kod och konfiguration) så att det kan stödja tjänsteavtal och kunddialog om GDPR art. 28–32. Det är **inte** juridisk rådgivning. Uppdatera datumet nedan när ni ändrar arkitektur eller leverantörer.

**Senast granskad mot kodbas:** 2026-04-11  

---

## 1. Roller i förhållande till GDPR

- **Personuppgiftsansvarig** är i normalfallet **kunden** (tennisföreningen) som bestämmer ändamålet med tidsrapporteringen.
- **Personuppgiftsbiträde** för driften av applikationen är **leverantören** (jfr integritetspolicyn i appen: `src/pages/PrivacyPolicy.tsx`).

Kundens instruktioner realiseras tekniskt genom att endast **registrerade användare** (kopplade till klubbens konto i er domänmodell) når data via API som kräver giltig Cognito-session.

---

## 2. Vilka personuppgifter som lagras (i er databas)

Tabeller enligt `database/schema.sql` och migrationer (bl.a. `cognito_user_id`, `registration_tokens`):

| Data | Var | Kommentar |
|------|-----|-----------|
| Namn, efternamn, e-post | `users` | Obligatoriska fält för konto. |
| Personnummer (valfritt) | `users.personnummer` | Kan vara tomt; känsligt om ifyllt. |
| UI-tema, legal acceptans | `users` | `ui_theme`, `legal_accepted_at`, `legal_version`. |
| Cognito-koppling | `users.cognito_user_id` | Migration: `database/migration-add-cognito-user-id.sql`. |
| Tidrapporter | `reports`, `entries` | Datum, tider, kommentarer, arbets-/ledighetstyper, m.m. |
| Registreringslänkar | `registration_tokens` | Token, `expires_at`, ev. metadata (se migration). |

**Lösenord** lagras **inte** i er PostgreSQL. Autentisering sker via **AWS Cognito** (lösenord och/eller OAuth enligt er Cognito-konfiguration).

---

## 3. Var och hur data bearbetas (flöde)

1. **Webbklient (React/Vite)** byggs och hostas via **AWS Amplify** (se `amplify.yml`). Anrop går med **HTTPS** till **API Gateway** (`VITE_API_BASE_URL`).
2. **API-anrop** skickar Cognito **ID-token** i header `Authorization: Bearer …` och i vissa fall även som query-parameter `_token` (se `src/services/api.ts`) — se avsnitt om luckor.
3. **AWS Lambda** (`lambda/*`) validerar token (JWKS från Cognito, se `lambda/utils/cognito-auth.ts`) och kör SQL mot **Neon PostgreSQL** via `@neondatabase/serverless` (`lambda/utils/database.ts`). Anslutningssträng `DATABASE_URL` ska använda TLS (`sslmode=require` enligt README).

**Viktigt:** Filen `src/services/database.ts` skapar också en Neon-klient med `process.env.DATABASE_URL`, men **inga andra filer under `src/` importerar den** i nuläget. Databasen ska **endast** nås från Lambda (server), inte från webbläsaren.

---

## 4. Autentisering och åtkomstkontroll

- **Cognito User Pool** konfigureras i frontend via `src/lib/cognito-config.ts` (pool-id, client-id, region, ev. Hosted UI / OAuth).
- Lambda använder `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`, `COGNITO_REGION` (sätts bl.a. via `scripts/set-lambda-env.js`).
- JWT kontrolleras mot Cognitos JWKS (cache TTL 1 h i `cognito-auth.ts`). Utgången token och fel issuer avvisas.
- App-användarens interna `users.id` kopplas till Cognito `sub` via `cognito_user_id` (och ev. e-postfallback vid första inloggning).

---

## 5. E-post (personuppgifter i trafik)

- **AWS SES** används i `lambda/submit-report.ts` för att skicka rapport till adress i `BOSS_EMAIL_ADDRESS`. Autentisering sker med `AWS_SES_ACCESS_KEY_ID` / `AWS_SES_SECRET_ACCESS_KEY` och region `SES_REGION` (standard `eu-north-1` i koden).

Ingen annan e-postleverantör finns hårdkodad i lambdorna som granskats.

---

## 6. Underbiträden (leverantörer) — faktisk lista

| Leverantör | Funktion | Var det syns i repot |
|------------|----------|----------------------|
| **Amazon Web Services (AWS)** | Cognito (auth), API Gateway, Lambda, CloudWatch (loggar), Amplify (frontend-hosting), SES (e-post) | `amplify.yml`, `lambda/*`, `src/lib/cognito-config.ts`, `scripts/set-lambda-env.js` |
| **Neon** | PostgreSQL (lagring av applikationsdata) | `lambda/utils/database.ts`, README |

**Region:** Kod och exempel pekar ofta på **`eu-north-1`** (Stockholm) för AWS. Exakt region för er deployment är en **drifts-/konto**fråga — verifiera i AWS Console och Neon Console.

**Tredjeland:** AWS och Neon kan ha verksamhet eller underleverantörer utanför EU/EES. Ni bör i kundavtal/personuppgiftsbiträdesavtal hänvisa till leverantörernas **dataskyddsavtal / SCC** enligt er faktiska AWS-kontoinställning och Neon-plan. Detta repo innehåller **inte** signerade kopior av sådana avtal.

**Analytics:** Ingen egen analytics (t.ex. Google Analytics) är inbakat i applikationskoden. `@aws-amplify/analytics` kan finnas som transitivt beroende i `package-lock.json` men används inte uttryckligen i källkoden som granskats.

---

## 7. Tekniska och organisatoriska åtgärder (art. 32) — vad som är sant idag

- **Kryptering i transit:** HTTPS mellan klient och API Gateway; TLS mot Neon via anslutnings-URL (`sslmode=require` enligt dokumentation).
- **Lösenord:** Hanteras av Cognito (hash/krypto där), inte av er appdatabas.
- **Behörighet:** API-endpoints som använder `getUserIdFromCognitoSession` förutsätter giltig token; se respektive lambda för undantag (t.ex. publika health eller OPTIONS).
- **Hemligheter:** `DATABASE_URL`, Cognito-nycklar, SES-nycklar, `REGISTRATION_SECRET` m.m. ska ligga i **Lambda-miljö** och/eller Amplify-byggmiljö — **aldrig** i git. Frontend får endast `VITE_*` som är avsedda att vara publika (Cognito client id, pool id, region, API URL).
- **Säkerhetsheaders (frontend):** `amplify.yml` sätter bl.a. `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`.

---

## 8. Loggar och incidenthantering

- **CloudWatch:** Lambda loggar fel och varningar. Tidigare fanns mer detaljerad felsökningslogg i `cognito-auth.ts`; den är borttagen så att **headers/query (som kunde innehålla token) och e-post** inte skrivs till loggar i normal drift. Vid behov av djup felsökning kan tillfällig loggning återinföras lokalt eller bakom en miljövariabel.
- **Formell incidentprocess** (rapportering till kund inom X timmar, kontaktväg): **finns inte beskriven i kod** — upprätta rutin och ev. bilaga till biträdesavtal.

---

## 9. Backups och återlämning / radering

- **Backups / point-in-time:** Styrs av **Neons** produktinställningar, inte av applikationskoden. Dokumentera i kundmaterial vilken **backup-policy** som gäller på ert Neon-projekt.
- **Radering vid avtalslut:** Schemat använder `ON DELETE CASCADE` mellan `users` → `reports` → `entries`, så **radering av en användarpost** tar bort kopplade rapporter poster. Det finns **ingen** centraliserad, dokumenterad “tenant offboarding”-rutin i kod som raderar hela klubbens data eller exporterar allt till kund — det är en **processlucka** om kunden slutar som helhet.

---

## 10. Registreringsflöde (QR / länk)

- `lambda/register-start.ts` kräver hemlighet `REGISTRATION_SECRET` i query; skapar eller återanvänder token i `registration_tokens` och redirectar till frontend med `?token=`.
- `REGISTRATION_SECRET` och `FRONTEND_URL` sätts via `scripts/set-lambda-env.js` för funktionen `timrapport-register-start`.

---

## 11. Konkreta luckor och förbättringsförslag (prioritering)

1. **JWT i query string (`_token`):** Risk för läckage via referer, access-loggar och webbläsarhistorik. **Förbättring:** Förlita er på `Authorization`-header endast; säkerställ att API Gateway/Lambda inte behöver query-fallback i produktion.
2. **CloudWatch-loggar:** Verbose logg i `cognito-auth.ts` är borttagen (2026-04). Granska övriga lambdor vid behov.
3. **`src/services/database.ts`:** Död kod som teoretiskt skulle kunna bundlas med DB-URL om någon importerar den — **ta bort** eller tydligt märk som förbjuden i frontend.
4. **CORS-listor:** Hårdkodade origins i t.ex. `submit-report.ts` och `register-start.ts` — håll synkade med faktiska Amplify-/produktionsdomäner; undvik glömda staging-URL:er.
5. **Formaliserad dataradering / export:** Implementera eller dokumentera manuell rutin för (a) export av en persons data, (b) radering av klubb/tenant vid avtalslut, i linje med biträdesavtalet.
6. **Underbiträdeslista för kund:** Publicera en kort **Subprocessor-lista** (webb eller PDF) som speglar tabellen ovan + länkar till AWS DPA och Neon DPA.
7. **Integritetspolicy i appen:** Uppdatera fortfarande “Staffcheck” till **Scaldus** där det ska vara konsekvent med varumärket (`PrivacyPolicy.tsx`).

---

## 12. Underhåll av detta dokument

- Vid ny extern tjänst (t.ex. felrapportering, ny e-post, CDN): lägg till i tabellen i avsnitt 6 och uppdatera `set-lambda-env.js` / README om det behövs.
- Vid ändring av databasschema: uppdatera avsnitt 2.
- Överväg versionsnummer i filnamn eller git-tag när ni skickar PDF till kund.
