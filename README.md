# Did Ben Play?

A small Next.js site that answers one question: **Did Ben Brereton Díaz play in his latest match (club or country)?**

It uses the BSD football API for fixtures, lineups, stats and odds, and Supabase/Postgres for a cached snapshot.

## Stack

- Next.js
- Supabase (Postgres)
- BSD API (`sports.bzzoiro.com`)
- GitHub Actions (refresh every 5 minutes)
- Vercel hosting

## Environment variables

Required in Vercel / `.env.local`:

```env
BSD_API_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
CRON_SECRET=
PLAYER_NAME=Ben Brereton Díaz
PLAYER_ID=          # optional – set if name search is ambiguous
```

## Local development

```bash
npm install
cp .env.example .env.local   # then fill in the values above
npm run dev
```

Then trigger a data refresh:

```bash
curl -H "Authorization: Bearer YOUR_CRON_SECRET" http://localhost:3000/api/refresh
```

## Automatic refresh

GitHub Actions (`.github/workflows/refresh.yml`) calls `/api/refresh` every 5 minutes.

Required repository secrets:

- `SITE_URL` — e.g. [https://didbenplay.com](https://didbenplay.com)
- `CRON_SECRET` — same value as in Vercel

## Notes

- Near kick-off the page also polls `/api/lineup-status` every minute to pick up the official team sheet.
- The site is intentionally conservative with labels (Started / Bench / Injured / Suspended / Not selected).
