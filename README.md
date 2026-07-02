# Village e-Meeting Next.js App

Next.js application for village e-meeting operations.

## Pages

- `/login` - Supabase email magic-link login for admins
- `/dashboard` - realtime monitor and compliance overview
- `/meetings` - meeting setup with Google Meet link
- `/documents` - Google Drive document registry
- `/voting` - open and secret voting workflows
- `/incidents` - incident reporting
- `/incident-reporting` - alias redirect to `/incidents`
- `/admin` - admin operations and audit readiness
- `/admin/data` - table-by-table add/delete data management UI

## Selected Stack

- Video conference: Google Meet
- Document storage: Google Drive
- Realtime database: Supabase
- Admins: 5 full-access admin accounts, each with separate login, 2FA, and audit logging

## Access Control

- All application pages using `AppShell` require a Supabase Auth session.
- Unauthenticated visitors are redirected to `/login`.
- `/admin` and `/admin/data` additionally require `is_admin()` to return true.
- Admin navigation and management forms are hidden from participants, observers, and staff.
- Supabase RLS remains the authoritative data-access boundary.

## Run Locally

Install dependencies:

```bash
npm install
```

Start development server:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

## Email Magic Link Authentication

Login is enabled for Supabase Auth and RLS. Create `.env.local` from `.env.example`:

```bash
cp .env.example .env.local
```

Fill in:

```text
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

In Supabase Dashboard:

1. Go to Authentication -> URL Configuration
2. Set Site URL to `http://localhost:3000`
3. Add Redirect URL `http://localhost:3000/auth/callback`
4. Enable Email provider
5. Test by opening `/login` and entering an email

The login form sends a Supabase magic link with `emailRedirectTo` set to `/auth/callback`.
The browser client uses the implicit flow so the callback can complete authentication even when the email opens in a different browser tab. Old PKCE links must be discarded after changing this setting.

## Production Work Still Needed

- Add profile creation / role sync after Supabase Auth login
- Add relationship selectors so admins can choose meetings/lots by name instead of pasting UUIDs
- Add edit/update forms for writable tables
- Connect Google Drive file links and evidence folders
- Add Google Meet event/link management
- Implement true open vote and secret ballot submission
- Implement CSV/PDF export for meeting evidence
- Add Row Level Security policies and 2FA requirements for admin accounts

## Database Schema

PostgreSQL schema for Supabase is included at:

```text
supabase/schema.sql
```

Optional development seed data:

```text
supabase/seed.sql
```

Run `schema.sql` first in the Supabase SQL editor, then run `seed.sql` only for local/dev testing.

After the main schema, run:

```text
supabase/002_secure_views.sql
supabase/003_auth_profiles.sql
```

Sign in once at `/login`, replace `ADMIN_EMAIL` in `supabase/004_promote_first_admin.sql`, then run that file in the Supabase SQL editor.

Finally run `supabase/005_dashboard_realtime.sql`; it adds the secure quorum aggregate RPC and enables Realtime events used by Dashboard and Meetings.
