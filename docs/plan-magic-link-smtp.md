# Plan: SMTP Magic-Link Login

## Context
The active v2 branch already uses Auth.js email login with a Resend provider and a development-only captured-link bypass. Production needs a provider-neutral SMTP path so users can sign in with ordinary SMTP credentials.

## Constraints
- Work only in `/home/ubuntu/product-factory-v2` on `claude/v2-nextjs`.
- Preserve the existing Prisma adapter, JWT sessions, login page, and development bypass.
- Keep SMTP configuration server-only and Tailwind/UI conventions unchanged.
- Follow the documented auth patterns in `auth.ts`, `app/login/page.tsx`, `lib/env.ts`, and existing e2e helpers.

## Implementation

1. Add the direct `nodemailer` dependency and lockfile entry.
2. Replace the Resend provider in `auth.ts` with Auth.js Nodemailer using `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_SECURE`, and `AUTH_EMAIL_FROM`.
3. Keep the non-production `sendVerificationRequest` override that stores a clickable dev URL.
4. Change the login page and e2e request helpers to use provider id `nodemailer`.
5. Update production environment validation and `.env.example` to document SMTP configuration and fail clearly when the host or sender is missing.
6. Update focused auth tests and run typecheck, lint on changed files, unit auth tests, and login e2e checks where supported.

## Risk
High enough for an auth-focused review because a wrong provider id or SMTP transport can block all sign-ins. Verify both production configuration failure and development bypass behavior.

## Verification
- `npm run typecheck`
- `npx eslint auth.ts lib/env.ts app/login/page.tsx tests/unit/env.test.ts`
- `npm run test:unit -- tests/unit/env.test.ts`
- Existing login e2e checks against the local app
- Read the final diff and confirm the legacy workspace was not modified.
