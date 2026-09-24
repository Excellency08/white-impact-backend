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
- `donation-submit`
- `donation-receipt-submit`
- `donation-approve`

The public submission/event functions are configured for anonymous invocation
because they perform their own validation and rate checks before privileged
server-side writes. `donation-receipt-access` requires an authenticated admin
JWT and returns only a short-lived private Storage signed URL.

Donation submission, receipt upload, and approval are privileged server-side
workflows. They preserve bank transfer details, private receipt Storage, role
checks, audit logging, and optional email delivery without exposing secrets to
the browser. The Express donation routes remain available as rollback until
these functions are deployed and browser-verified.
