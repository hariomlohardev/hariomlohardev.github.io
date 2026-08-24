# Security — Secret Rotation Required (C8 / H5 / H6 / L7)

> **Status: 2026-08-24 — secrets were present in `D:/temp/demo/.env` on disk.**
> Git history is clean (`.env` never committed, `git log --all -- .env` empty), but values must be treated as compromised if the directory was ever copied, screen-shared, backed up, or pasted. Rotate immediately.

## What leaked (C8)

`D:/temp/demo/.env` contained:

```
GITHUB_TOKEN=ghp_XHyVpIo4UH...        # GitHub PAT — repo/org access
SUPABASE_SERVICE_ROLE_KEY=eyJ...      # Supabase service_role — bypasses RLS, full DB admin
ADMIN_USERNAME=hariomlohar
ADMIN_PASSWORD=Hariom2008@lohar       # plaintext admin credential
ADMIN_JWT_SECRET=a9779ab33f...        # signing key for admin_token cookie/JWT
SUPABASE_URL / ANON_KEY               # ANON is public by design, but rotated if co-leaked
```

`.env.local` contained a `VERCEL_OIDC_TOKEN` (short-lived, auto-issued by `vercel env pull`; rotates on next pull, no manual action).

## Patches applied (this commit)

### 1. `.gitignore` — ensure `.env` is always ignored
- Added explicit block:
  ```
  .env
  .env.local
  .env.*.local
  .env.development / .env.production (+ .local variants)
  .env*        # keep before negations
  !.env.example
  !.env.sample # whitelisted — safe to commit
  ```
- Verified: `git add --dry-run .env` → blocked; `git add .env.example` → allowed.
- Verified: `git ls-files --cached | grep env` → none tracked; `git log --all -- .env` → empty.
- If `.env` had been tracked: `git rm --cached .env .env.local` (keeps file on disk, removes from index). Do **NOT** run `git rm .env` (deletes on disk).

### 2. `.env.example` — safe onboarding template
- Created `D:/temp/demo/.env.example` with placeholders (no real secrets). Copy to `.env` and fill from dashboards.

### 3. `api/admin/login.js` (H5)
- `secure: true` → `secure: process.env.NODE_ENV === 'production'` — allows `http` on `localhost` dev, enforces HTTPS in production (previous `secure:true` broke local login).
- `path: '/'` → `path: '/api'` — scope cookie to API routes only (least privilege; was sent to every static page).
- Added rate-limit hint comment: protect with Vercel Firewall rate-limit rule or `@upstash/ratelimit` edge middleware (e.g. 5 req/min per IP).

### 4. `api/admin/verify.js` (H6)
- **Removed `?token=` query fallback** — previously `req.query.token` and `req.url.includes('token=')`. Query tokens leak via server logs, `Referer`, browser history, and CDN cache keys. Now only `HttpOnly cookie (admin_token)` and `Authorization: Bearer` accepted.
- Added `res.setHeader('Cache-Control', 'no-store')` at top of handler so every response (200/401/500) is never stored by browser/CDN.

## Rotate now — step by step

Do this even if `.env` was never pushed. Assume compromise until keys are rotated.

### A. Supabase — `SUPABASE_SERVICE_ROLE_KEY` (and ANON if desired)
1. Supabase Dashboard → Project `rgmvhptebkslkjleoilc` → **Project Settings → API** (or **Configuration → API**).
2. **Reset service_role key** (or **Generate new service_role secret** if on new key system). Copy new `service_role` JWT.
3. Supabase → **Database → Roles** — confirm no unexpected service_role usage in logs (`Logs Explorer` → Postgres logs).
4. Vercel Dashboard → Project `hariomlohardev-github-io` → **Settings → Environment Variables** → edit `SUPABASE_SERVICE_ROLE_KEY` → paste new value → Save → **Redeploy** (or `vercel --prod`).
5. Locally: update `D:/temp/demo/.env` `SUPABASE_SERVICE_ROLE_KEY=<new>`; never commit.
6. Optional: also rotate `SUPABASE_ANON_KEY` the same way, update Vercel + local `.env`.

> If you use Supabase CLI linked project: `supabase link` then check `supabase status` — no CLI rotate for service_role; must use dashboard.

### B. Vercel — `ADMIN_PASSWORD`, `ADMIN_USERNAME`, `ADMIN_JWT_SECRET`
1. Generate new secrets locally:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" # for ADMIN_JWT_SECRET
   # or: openssl rand -hex 32
   ```
   Pick a new `ADMIN_PASSWORD` (password manager, >= 20 chars).
2. Vercel Dashboard → Project → **Settings → Environment Variables**:
   - `ADMIN_JWT_SECRET` → new hex (all environments: Production + Preview + Development)
   - `ADMIN_PASSWORD` → new password
   - `ADMIN_USERNAME` → keep or rotate (if changing, note new login)
   - Ensure `SUPABASE_*` already updated above.
3. **Redeploy** → `Deployments` → latest → **Redeploy** (without cache) so serverless functions pick new env.
4. Locally: update `D:/temp/demo/.env` with new `ADMIN_JWT_SECRET`, `ADMIN_PASSWORD`.
5. Invalidate old JWTs: users will be logged out (old tokens fail `jwt.verify` with new secret) — expected. Clear `admin_token` cookie by logging out/in.
6. Test: `curl -X POST https://<prod>/api/admin/login -H "Content-Type: application/json" -d '{"username":"...","password":"..."}' -i` → check `Set-Cookie: admin_token=...; Path=/api; Secure; HttpOnly; SameSite=Lax`.

### C. GitHub — `GITHUB_TOKEN` (`ghp_XHy...`)
1. GitHub → **Settings → Developer settings → Personal access tokens → Tokens (classic)** (or Fine-grained PATs if used).
2. Find token starting `ghp_XHy` → **Delete / Revoke** immediately.
3. Generate new token with minimal scopes needed for this repo (e.g. `repo`, `workflow` if CI needs it — prefer fine-grained PAT limited to `hariomlohardev/hariomlohardev.github.io`).
4. Update consumers:
   - Vercel → **Settings → Environment Variables** → `GITHUB_TOKEN` (if used in builds/functions) → new value → Redeploy.
   - Local `D:/temp/demo/.env` → `GITHUB_TOKEN=<new>`
   - GitHub Actions secrets: Repo → **Settings → Secrets and variables → Actions** → update if PAT stored there.
   - Any `gh` CLI stored creds: `gh auth status`, `gh auth login` if using PAT.
5. Audit: GitHub → **Settings → Audit log** and token usage → search for unexpected clones.

### D. Local cleanup
```bash
cd D:/temp/demo
# confirm ignored
git check-ignore -v .env   # should print .env* line
git ls-files --cached | grep -E "^\.env" || echo "clean"

# keep file on disk but ensure not staged (if it ever was tracked)
git rm --cached .env .env.local 2>&1 | cat  # expect "did not match" if already clean

# refill .env from example + dashboard values
cp .env.example .env   # then edit with new rotated values
# DO NOT git add -f .env
```

### E. If `.env` ever *was* committed (history purge — not needed now but keep)
Current repo history is clean. If a future leak reaches a commit:
```bash
git log --all --oneline -- .env   # find bad commit
# For last N commits, or use BFG / filter-repo:
git filter-repo --invert-paths --path .env --path .env.local --force
# or BFG: bfg --delete-files .env
git push --force --all
# then rotate keys anyway (history remains on forks/clones)
```

## Verify patches

```bash
# H5 login cookie
grep -n "secure.*NODE_ENV" api/admin/login.js
grep -n "path: '/api'" api/admin/login.js
grep -n "Rate-limit" api/admin/login.js

# H6 verify
grep -n "Cache-Control.*no-store" api/admin/verify.js
! grep -n "req.query.token" api/admin/verify.js  # should be no match
! grep -n "searchParams.get('token')" api/admin/verify.js
```

Manual test:

# login should set Path=/api; Secure only on https
curl -i -X POST http://localhost:3000/api/admin/login -H "Content-Type: application/json" -d '{"username":"...","password":"..."}'
# verify via cookie
curl -i http://localhost:3000/api/admin/verify --cookie "admin_token=<jwt>"
# verify rejects query
curl -i "http://localhost:3000/api/admin/verify?token=<jwt>"  # expect 401 No token
# check no-store header
curl -i http://localhost:3000/api/admin/verify | grep -i "cache-control: no-store"
```

## References
- Vercel env: https://vercel.com/docs/projects/environment-variables
- Vercel Firewall rate limiting: https://vercel.com/docs/firewall/rate-limiting
- Supabase API keys: https://supabase.com/docs/guides/api/api-keys
- GitHub PATs: https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token
