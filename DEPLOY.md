# The Turtles Cafe POS — Deploy Guide

## Before you deploy — fill config.ts

Open `src/config.ts` and replace every placeholder:

```ts
SHOP_NAME: 'The Turtles Cafe',          // confirm spelling
SHOP_ADDRESS: 'Your full address here', // used on receipts
SHOP_PHONE: '9XXXXXXXXX',              // 10 digits
GSTIN: 'XXXXXXXXXXXXXXXXXXXX',          // 15-char GSTIN
GST_RATE: 5,                            // 5 or 18 — confirm with CA
GST_MODE: 'exclusive',                  // exclusive = GST added on top
SERVICE_CHARGE_PERCENT: 0,              // 0 = off, 10 = 10%
PIN_RESET_SECRET: '1234',              // CHANGE THIS — secret reset code
```

---

## Step 1 — Deploy to Vercel

1. Push this folder to a GitHub repo (private recommended)
2. Go to vercel.com → New Project → Import from GitHub
3. Framework: Vite
4. Build command: `npm run build`
5. Output directory: `dist`
6. Click Deploy

Your app is now live at `https://your-project.vercel.app`

---

## Step 2 — Custom domain (optional)

1. In Vercel → Project → Settings → Domains
2. Add your domain (e.g. `pos.turtlescafe.in`)
3. Point your DNS A record to Vercel's IP

---

## Step 3 — Supabase cloud backup (optional but recommended)

1. Go to supabase.com → New project
2. Open SQL editor and run:

```sql
create table pos_backups (
  id           uuid primary key default gen_random_uuid(),
  shop_name    text not null,
  backed_up_at timestamptz not null default now(),
  payload      jsonb not null
);
alter table pos_backups enable row level security;
create policy "anon can do all" on pos_backups
  for all using (true) with check (true);
```

3. Go to Settings → API → copy:
   - Project URL → paste into `SUPABASE_URL` in config.ts
   - anon public key → paste into `SUPABASE_ANON_KEY`

4. Redeploy on Vercel

Backup will now run automatically every night at 2 AM.

---

## Step 4 — Install as PWA on Android

1. Open Chrome on Android
2. Navigate to your Vercel URL
3. Chrome shows "Add to Home Screen" banner
   - OR tap ⋮ menu → "Add to Home Screen"
4. Name it "TTC POS" → Add
5. App icon appears on home screen
6. Opens fullscreen like a native app

**First time only:** pair your Bluetooth printer in Settings → Pair Bluetooth Printer

---

## Step 5 — Add custom app icon

Replace these files in `public/` before deploying:
- `pwa-192x192.png` — 192×192px, transparent background
- `pwa-512x512.png` — 512×512px, transparent background  
- `apple-touch-icon.png` — 180×180px

Use Canva or Figma to create a turtle/cafe logo icon.
Colors: background `#1a4731` (dark green), icon white.

---

## Supabase SQL cheat sheet

```sql
-- View latest backup
select shop_name, backed_up_at, pg_size_pretty(pg_column_size(payload)::bigint)
from pos_backups order by backed_up_at desc limit 5;

-- Delete old backups (keep latest only)
delete from pos_backups where id not in (
  select id from pos_backups order by backed_up_at desc limit 1
);
```

---

## Common issues

| Problem | Fix |
|---|---|
| "Web Bluetooth not available" | Use Chrome on Android, not Firefox or Safari |
| Printer pairs but won't print | Check printer model supports BLE ESC/POS — GoojPrt recommended |
| Pop-up blocked on print | Allow pop-ups in Chrome settings for your domain |
| App shows old version after deploy | In Chrome: Settings → Clear browsing data → Cached images |
| PIN forgotten | Long-press turtle logo 5 times → enter PIN_RESET_SECRET |
