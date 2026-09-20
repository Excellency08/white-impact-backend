# White Impact Edge Functions

Prepared Supabase Edge Function sources for the Supabase-only migration.

Required Edge secrets:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SECRET_KEY`
- `ALLOWED_ORIGINS` or `CORS_ORIGIN`
- `FRONTEND_URL`
- `SITE_URL`
- `RESEND_API_KEY`
- `FROM_EMAIL`
- `STAFF_EMAIL`
- `SEND_EMAILS`
- `MOCK_EMAIL`

Prepared functions:

- `contact-submit`
- `volunteer-submit`
- `newsletter`
- `analytics-events`
- `donation-receipt-access`

The public submission/event functions are configured for anonymous invocation
because they perform their own validation and rate checks before privileged
server-side writes. `donation-receipt-access` requires an authenticated admin
JWT and returns only a short-lived private Storage signed URL.

These sources are not wired into the frontend until deployment and live
acceptance testing confirm the Supabase Edge endpoints behave like the
existing Express routes.
