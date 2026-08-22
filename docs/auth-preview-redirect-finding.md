# Auth Preview Redirect Finding

Source: Supabase dashboard URL Configuration for Product Factory, https://supabase.com/dashboard/project/glcdwmnzzszxrnxerdlb/auth/url-configuration

Observed on 2026-08-15: Site URL was `http://localhost:3000`. Redirect URLs list was empty. The Product Factory login code requests `window.location.origin + /auth/callback`, so Supabase fell back to the localhost Site URL when the preview origin was not configured.

Required preview configuration:

| Setting | Value |
|---|---|
| Site URL | `https://3000-iej5awwyrql648ql6f1j1-8514280e.sg1.manus.computer` |
| Additional Redirect URL | `https://3000-iej5awwyrql648ql6f1j1-8514280e.sg1.manus.computer/auth/callback` |

The Supabase dashboard was updated and verified on 2026-08-15. The Site URL displays the live preview origin, the redirect allow-list contains the exact `/auth/callback` URL, and Supabase reported successful updates.

Supabase page text states that Site URL is the default redirect when a redirect URL is not specified or does not match the allow list, and Redirect URLs are the URLs auth providers are permitted to use post-authentication. See the [Supabase redirect URL documentation](https://supabase.com/docs/guides/auth/concepts/redirect-urls).

## Live Preview Verification

The preview loaded at `https://3000-iej5awwyrql648ql6f1j1-8514280e.sg1.manus.computer`. The app login page loaded from `/login?callbackUrl=%2Fapp`, and submitting `test@example.com` enabled the request and rendered `Check your email` without a client-side error. The actual inbox click-through remains unverified because that test address is not controlled by this session.

A deeper smoke test initially found that the deployed callback returned `307 Location: https://0.0.0.0:3000/login?error=auth_callback_failed`. The callback was patched to prefer `x-forwarded-host` and `x-forwarded-proto`, a regression test was added in `tests/integration/auth-callback.test.ts`, and the standalone preview was rebuilt and restarted with `.env.local` loaded. The same smoke test now returns:

`307 Location: https://3000-iej5awwyrql648ql6f1j1-8514280e.sg1.manus.computer/login?error=auth_callback_failed`

This confirms that the live callback no longer sends users to localhost or the internal `0.0.0.0` host. The temporary preview URL is not suitable as a permanent production URL; replace it with the permanent deployment domain before launch.

## Verification Status

The auth callback regression tests pass, typecheck passes, and lint exits successfully with 16 non-blocking warnings. The focused monetization, Stripe, Etsy, release, entitlement, and quota tests pass with 30 passing tests and 0 failures. The two-owner live RLS test remains skipped because the sandbox does not have a Supabase service-role key and two authenticated owner access tokens. No repository commit has been created.

Author: Manus AI
