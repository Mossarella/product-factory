# Spec: SMTP Magic-Link Login

## Overview
Replace the production magic-link delivery provider with Auth.js Nodemailer backed by configurable SMTP credentials, while preserving the existing development bypass and login page experience. The goal is a simple email-only sign-in flow that works with common SMTP providers without requiring a Resend account.

## Follows the pattern of
- `auth.ts` — existing Auth.js provider configuration, Prisma adapter, JWT sessions, and development-only `sendVerificationRequest` override.
- `app/login/page.tsx` — existing email submission, `signIn` call, verification confirmation state, and development login-link display.
- `app/api/auth/dev-url/route.ts` and `lib/dev-auth.ts` — development-only bypass behavior that must remain unchanged.
- `lib/env.ts` and `tests/unit/env.test.ts` — environment validation and test isolation conventions.
- `tests/e2e/login.spec.ts` and existing e2e sign-in helpers — login UI and provider-id usage.

## Requirements

### Functional
- Configure Auth.js with the `nodemailer` provider and an SMTP transport built from environment variables.
- Support `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, and `AUTH_EMAIL_FROM`.
- Allow `SMTP_SECURE` to be set explicitly; otherwise infer secure transport for port 465.
- Keep the development bypass: outside production, do not send real email, capture the generated URL in `lib/dev-auth.ts`, and keep the clickable dev link on the login page.
- Update the login client and e2e helpers to use provider id `nodemailer` instead of `resend`.
- In production, return a clear configuration failure if the SMTP host or sender address is missing rather than silently falling back to a fake provider.
- Keep the current success and error UX: show a confirmation state after a successful request and an inline error when delivery fails.

### Non-functional
- Use the existing Next.js 16 App Router, React 19, TypeScript, Tailwind, Auth.js, Prisma adapter, and JWT session setup.
- Do not touch the legacy v0/v1 branch or workspace.
- Do not expose SMTP credentials to client code.
- Preserve the current dev-only bypass and avoid changing database/session behavior.
- Update `.env.example` with a copy-pasteable SMTP block and remove Resend as the required magic-link configuration.

## Architecture check
- Auth configuration belongs in `auth.ts`; SMTP values are read server-side only.
- Environment validation belongs in `lib/env.ts` and is tested through `tests/unit/env.test.ts`.
- Client code may call `signIn('nodemailer', ...)` but must not import Nodemailer or read SMTP variables.
- The provider should be configured with the existing `sendVerificationRequest` override only in non-production.

## Test tier this change must climb
- Unit: extend `validateEnv()` coverage for production SMTP configuration requirements and secure-port behavior in a pure helper if one is introduced.
- Integration: add focused auth configuration coverage if the provider setup can be tested without a real SMTP connection; verify the dev override captures a URL.
- E2E: update login helper/provider id and verify the login page remains usable.
- UI E2E: not required beyond the existing login-page checks unless the visible login UI changes.

## Implementation

### Files to modify
- `auth.ts`: switch from Resend to Nodemailer and construct the SMTP server configuration from server-only environment variables; retain the development override.
- `app/login/page.tsx`: call `signIn('nodemailer', ...)`.
- `lib/env.ts`: validate production SMTP host, port, user/password as appropriate, and sender configuration with a clear error.
- `.env.example`: document SMTP settings and remove the Resend magic-link block.
- `tests/unit/env.test.ts`: update environment key fixtures and assertions.
- `tests/e2e/*.spec.ts`: update direct magic-link sign-in requests from `/resend` to `/nodemailer` where applicable.
- `package.json` / `package-lock.json`: add a direct `nodemailer` dependency if the project does not already declare it directly.

## Out of Scope
- Adding OAuth providers.
- Changing user/account/session schemas.
- Sending marketing email or password-reset email.
- Building an SMTP settings screen.
- Adding a production email inbox or mail-testing service.

## Verification
1. Run `npm run typecheck`.
2. Run the focused auth unit tests and existing login e2e checks where the local test environment is available.
3. Start the v2 app and navigate to `/login`.
4. In development, submit an email and confirm the captured dev link still appears.
5. Inspect the final diff and confirm no legacy workspace or branch was modified.
