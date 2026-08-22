# Preview Static Asset Fix

The live dashboard failure was caused by the standalone Next.js preview being restarted without copying `.next/static` into `.next/standalone/.next/static`. The HTML shell loaded, but browser requests for `/_next/static/chunks/*.js` returned 404/plain text. Chromium reported `NS_ERROR_CORRUPTED_CONTENT`, blocked the resource because the MIME type was `text/plain`, and then showed the generic “This page couldn’t load” screen.

The preview packaging was repaired by copying `.next/static` into `.next/standalone/.next/static` and copying `public` into `.next/standalone/public`, then restarting the standalone server with `.env.local` loaded.

Verification on 2026-08-15:

| Check | Result |
|---|---|
| Sample JavaScript chunk | HTTP 200 |
| Content type | `application/javascript; charset=UTF-8` |
| Static asset cache policy | `public, max-age=31536000, immutable` |
| `/app/dashboard` unauthenticated response | Correct public-host redirect to `/login?callbackUrl=%2Fapp%2Fdashboard` |
| Browser after reload | Product Factory login screen renders normally |

No repository commit was created.
