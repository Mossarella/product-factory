# Dashboard Preview Fix

Observed on 2026-08-15: opening `/app/dashboard` on the temporary preview showed a browser-level “This page couldn’t load” screen. The protected-route middleware built its unauthenticated login URL from `request.url`; behind the preview proxy, that request URL used the internal `0.0.0.0:3000` origin, so the browser could not follow the redirect correctly.

The fix adds `lib/public-origin.ts`, which prefers `x-forwarded-host` and `x-forwarded-proto` and falls back to the request host. Both `middleware.ts` and `app/auth/callback/route.ts` now use this shared helper. Regression coverage was added in `tests/unit/public-origin.test.ts`; the existing auth callback tests also continue to pass.

After rebuilding and restarting the standalone preview with `.env.local` loaded, a request to `/app/dashboard` returns:

`307 Location: https://3000-iej5awwyrql648ql6f1j1-8514280e.sg1.manus.computer/login?callbackUrl=%2Fapp%2Fdashboard`

The browser now reaches the Product Factory login screen at that public URL instead of showing the page-load failure. No commit was created.
