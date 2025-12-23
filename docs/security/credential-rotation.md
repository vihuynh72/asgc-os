# Credential Rotation Checklist

## Quarterly (or per term)
- Rotate Supabase service role key.
- Rotate any email/SMTP credentials.
- Rotate AI API keys (if configured).

## Steps
1. Generate new key in provider dashboard.
2. Update server-side env vars (never in client `NEXT_PUBLIC_*`).
3. Deploy and verify:
   - Admin APIs work
   - Office hours cron routes work
   - Docs uploads work
4. Revoke old keys.

## Documentation
- Record rotation date and operator.
- Update incident log if rotation was in response to a suspected leak.
