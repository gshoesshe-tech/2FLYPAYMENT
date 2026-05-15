# 2FLY Payment Verification Hub

A private payment verification website for tracking online and walk-in collections across 3 GCash accounts, cash, bank transfer, and other methods.

## Files

- `login.html` — admin login
- `submit-payment.html` — payment upload form
- `admin.html` — payment verification dashboard
- `reports.html` — daily collection reports
- `styles.css` — premium 2FLY dark UI
- `app.js` — Supabase logic, upload, verification, reports, Google Sheets webhook
- `config.example.js` — rename to `config.js` and add keys
- `supabase-schema.sql` — database setup
- `google-apps-script.js` — Google Sheets sync script

## Workflow

1. Admin logs in.
2. Admin uploads payment proof/reference/order ID.
3. Payment starts as pending.
4. Admin checks GCash/cash proof.
5. Admin clicks Verified / Good to Go.
6. Verified payment is counted in reports.
7. If Google webhook is configured, verified payment syncs to Google Sheets.

## Walk-in Order ID

Walk-in Order ID is manual.

Recommended format:

```text
WALKIN-20260515-001
WALKIN-20260515-002
```

But you can use any code you want.

## Supabase setup

1. Create Supabase project.
2. Go to SQL Editor.
3. Paste and run `supabase-schema.sql`.
4. Go to Authentication > Users and create your admin/owner user.
5. Run this SQL to make yourself owner:

```sql
update public.profiles
set role = 'owner', full_name = 'Benz'
where email = 'YOUR_EMAIL_HERE';
```

6. Go to Storage.
7. Create bucket named:

```text
payment-proofs
```

8. Make it public, or create signed URL logic later if you want private images.

## Frontend setup

1. Rename:

```text
config.example.js
```

to:

```text
config.js
```

2. Fill in:

```js
SUPABASE_URL
SUPABASE_ANON_KEY
GCASH_ACCOUNTS
GOOGLE_SHEETS_WEBHOOK_URL
```

3. Upload all website files to Netlify.

## Google Sheets setup

1. Create a Google Sheet.
2. Click Extensions > Apps Script.
3. Paste `google-apps-script.js`.
4. Run `setupSheets`.
5. Deploy > New deployment > Web app.
6. Execute as: Me.
7. Who has access: Anyone.
8. Copy the Web App URL to `config.js`:

```js
GOOGLE_SHEETS_WEBHOOK_URL: "YOUR_DEPLOYED_WEB_APP_URL"
```

## Important security note

Never put your Supabase Service Role key in frontend files.

Only use the Supabase anon key in `config.js`.

## Next recommended upgrades

- Add edit payment modal
- Add partial payment/balance tracking
- Add export CSV button
- Add daily closeout/cash count confirmation
- Add owner-only user management page
- Connect with your existing 2FLY order dashboard
