# Database Setup

## Skapa tabeller i Neon-databasen

Du behöver köra SQL-schemat för att skapa tabellerna i din Neon-databas.

### Metod 1: Via Neon Console (Rekommenderat)

1. Gå till [Neon Console](https://console.neon.tech)
2. Välj ditt projekt
3. Klicka på "SQL Editor" i vänstermenyn
4. Öppna filen `database/schema.sql` i detta projekt
5. Kopiera allt innehåll från `schema.sql`
6. Klistra in i SQL Editor
7. Klicka på "Run" för att köra SQL-koden

### Metod 2: Via psql (Kommandorad)

Om du har `psql` installerat:

```bash
psql "din-database-url" < database/schema.sql
```

Ersätt `din-database-url` med din DATABASE_URL från `.env.local`.

### Verifiera att tabellerna skapades

Efter att ha kört schemat, kan du verifiera i Neon Console:

```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public';
```

Du bör se:
- users
- reports  
- entries

