# Spec: LLM Integration — Phase 1 (Description, Tags, Listing Review)

## Overview
Add three AI-assisted actions to the Etsy listing panel, each grounded in the
seller's actual structured product data (title, files/folders, price,
license, notes, existing tags) rather than generic boilerplate:

1. **Generate description** — upgrades the existing "Refresh Description"
   button from a static mail-merge into an LLM-written listing description.
2. **Suggest tags** — upgrades the existing "Suggest" button from a
   hardcoded tag list into LLM-generated tags specific to this product.
3. **Review listing** — new action: LLM critiques the current
   title+description+tags and returns a clarity score + concrete issues.

This is explicitly phase 1 of a larger plan (5 candidate LLM capabilities
were scoped; "Explain what's missing" and "Generate instructions" are
deferred). Scoped as a POC: lean implementation, configurable model (not
hardcoded), no new persistence beyond what already exists.

## Follows the pattern of
- `components/EtsyListing.tsx` — existing `refreshDescription()` /
  `SUGGESTED_TAGS` buttons are the blueprint for where these calls plug in;
  same button-click → set-local-state UX, no new persistence wiring.
- `lib/templates.ts` (`TemplateData`) — reused as-is for the LLM context
  shape (name, etsyName, contact, description, notes, licenseType, price,
  commercialPrice, currency, folders, etsyTags) — this is the "moat" data,
  already assembled client-side in `EtsyListing.tsx`'s `templateData` memo.
- `lib/db.ts` — module-level singleton pattern, reused for the Anthropic
  client singleton in the new `lib/ai.ts`.
- `app/api/products/[name]/config/route.ts` — auth pattern
  (`auth()` → `session.user.id` → 401 if missing) for the new API route.
- `.env.example` — sectioned, commented env var blocks; add a new
  `# ─── Anthropic (AI features) ───` section following the same style.

## Requirements

### Functional
- New POST route `app/api/products/[name]/ai/route.ts`, auth-gated, body:
  ```ts
  {
    action: 'description' | 'tags' | 'review'
    context: TemplateData   // current on-screen state, NOT re-fetched from DB
  }
  ```
  The client sends its current (possibly unsaved) form state as context —
  same principle as today's `refreshDescription()`, which uses in-memory
  `templateData`, not a DB round-trip. No DB writes happen in this route.
- `lib/ai.ts` (new, server-only):
  - Module-level `Anthropic` client singleton, constructed from
    `process.env.ANTHROPIC_API_KEY`.
  - `getAiModel()` → `process.env.ANTHROPIC_MODEL || 'claude-sonnet-5'`
    (POC default: cheaper than Opus, configurable without a code change —
    per explicit request to keep this swappable, not hardcoded).
  - `generateDescription(context: TemplateData): Promise<string>` — plain
    text prose, non-streaming, `max_tokens` ~1024.
  - `suggestTags(context: TemplateData): Promise<string[]>` — uses
    `output_config.format` (json_schema, array of strings) so the result is
    guaranteed-valid JSON, not parsed from free text. Prompt must instruct:
    stay within Etsy's 13-tag / 20-char-per-tag limits, don't duplicate
    tags already in `context.etsyTags`, return only new tags to add.
  - `reviewListing(context: TemplateData): Promise<{ score: number; issues: Array<{ summary: string; suggestion: string }> }>`
    — also via `output_config.format` json_schema for a clean, renderable
    shape instead of parsed prose.
  - If `ANTHROPIC_API_KEY` is unset, throw a clear `AiNotConfiguredError`
    (or similar) — the route catches this and returns
    `503 { error: 'AI features are not configured' }` rather than a raw
    SDK exception. This is a boundary check (external config), not
    speculative error handling.
- `app/api/products/[name]/ai/route.ts`:
  - `auth()` check (401 if no session), same shape as `config/route.ts`.
  - Parse body, validate `action` is one of the three, validate `context`
    is present.
  - Dispatch to the matching `lib/ai.ts` function, wrap in try/catch:
    - `AiNotConfiguredError` → 503 with the message above.
    - Any other thrown error (Anthropic SDK errors, etc.) → 502 with a
      generic `{ error: 'AI generation failed' }` (don't leak SDK internals
      to the client).
  - Success responses:
    - `description` → `{ description: string }`
    - `tags` → `{ tags: string[] }`
    - `review` → `{ score: number, issues: [...] }`

### Non-functional
- No streaming — outputs are short (a listing description, a handful of
  tags, a short critique), well under timeout risk.
- No adaptive thinking — this is direct content generation, not multi-step
  reasoning; omit the `thinking` param (Sonnet 5 default behavior applies).
- Add `@anthropic-ai/sdk` to `package.json` dependencies.
- Add to `.env.example`:
  ```
  # ─── Anthropic (AI features) ──────────────────────────────────────────────────
  # Get from https://console.anthropic.com/settings/keys
  ANTHROPIC_API_KEY=sk-ant-...
  # Optional — defaults to claude-sonnet-5 if unset. Swap for a different
  # model without a code change (e.g. claude-opus-4-8 for higher quality,
  # claude-haiku-4-5 for lowest cost).
  ANTHROPIC_MODEL=claude-sonnet-5
  ```
- UI: keep the AI upgrade "in place" — no new page, no new nav entry.
  - `EtsyListing.tsx`: `refreshDescription()` becomes an async call to the
    new route (`action: 'description'`); button label changes from
    "Refresh Description" to "Generate Description" (signals it's
    generative, not a deterministic recompute); add a loading/disabled
    state on the button while the request is in flight.
  - The `SUGGESTED_TAGS` constant and its consumer are replaced by a call
    to the new route (`action: 'tags'`), same `onTagsChange([...etsyTags,
    ...newTags])` append behavior as today; loading/disabled state on the
    button while in flight.
  - New "Review Listing" button + small results area (score + bulleted
    issues list with suggestions), placed near the existing readiness
    checklist at the top of the component (conceptually related — both are
    "how good is this listing" signals). Loading/disabled state while in
    flight; clear the previous result when a new review starts.
  - All three actions must surface a fetch failure to the user (e.g. a
    small inline error line), not fail silently — this hits a real network
    boundary (external API call) so this is not speculative error handling.

## Architecture check
- Layer: `lib/ai.ts` is server-only (uses `ANTHROPIC_API_KEY`, must never be
  imported from a `'use client'` file). The API route is the only caller.
- Imports allowed: `lib/ai.ts` imports `@anthropic-ai/sdk` and
  `lib/templates.ts` (`TemplateData` type) only — no Prisma import needed
  since context comes from the request body, not the DB.
- Imports forbidden: `components/EtsyListing.tsx` must not import
  `@anthropic-ai/sdk` or `lib/ai.ts` directly — it only calls the API route
  via `fetch`, same as every other client component in this app.

## Implementation

### Files to create

#### 1. `lib/ai.ts`
Server-only module. Anthropic client singleton (mirrors `lib/db.ts`'s
`globalForPrisma` pattern is unnecessary here since the SDK client is cheap
to construct once per module load — a plain top-level
`const anthropic = new Anthropic()` is enough, no global-caching needed for
non-DB clients in a Next.js server module).

```ts
import Anthropic from '@anthropic-ai/sdk'
import type { TemplateData } from './templates'

export class AiNotConfiguredError extends Error {}

function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new AiNotConfiguredError('ANTHROPIC_API_KEY is not set')
  return new Anthropic()
}

function getModel(): string {
  return process.env.ANTHROPIC_MODEL || 'claude-sonnet-5'
}

function contextSummary(context: TemplateData): string {
  return JSON.stringify({
    productName: context.name,
    etsyTitle: context.etsyName,
    description: context.description,
    notes: context.notes,
    licenseType: context.licenseType,
    price: context.price,
    commercialPrice: context.commercialPrice,
    currency: context.currency,
    folders: context.folders,
    existingTags: context.etsyTags,
  })
}

export async function generateDescription(context: TemplateData): Promise<string> {
  const client = getClient()
  const message = await client.messages.create({
    model: getModel(),
    max_tokens: 1024,
    system: 'You write compelling, accurate Etsy listing descriptions for digital products (assets, templates, printables, and similar). Write in a warm, direct tone. Do not invent facts not present in the product data — only elaborate on what is given.',
    messages: [{
      role: 'user',
      content: `Write an Etsy listing description for this digital product:\n\n${contextSummary(context)}\n\nReturn only the description text, no preamble or headers.`,
    }],
  })
  const textBlock = message.content.find((block) => block.type === 'text')
  return textBlock?.type === 'text' ? textBlock.text.trim() : ''
}

export async function suggestTags(context: TemplateData): Promise<string[]> {
  const client = getClient()
  const message = await client.messages.create({
    model: getModel(),
    max_tokens: 512,
    system: 'You suggest Etsy search tags for digital products. Etsy tags must each be 20 characters or fewer. Never repeat a tag already in use.',
    messages: [{
      role: 'user',
      content: `Suggest new Etsy tags for this product. It already has ${context.etsyTags.length}/13 tags used; suggest at most ${13 - context.etsyTags.length} new ones.\n\n${contextSummary(context)}`,
    }],
    output_config: {
      format: {
        type: 'json_schema',
        schema: {
          type: 'object',
          properties: { tags: { type: 'array', items: { type: 'string' } } },
          required: ['tags'],
          additionalProperties: false,
        },
      },
    },
  })
  const textBlock = message.content.find((block) => block.type === 'text')
  if (textBlock?.type !== 'text') return []
  const parsed = JSON.parse(textBlock.text) as { tags: string[] }
  return parsed.tags
}

export async function reviewListing(context: TemplateData): Promise<{ score: number; issues: Array<{ summary: string; suggestion: string }> }> {
  const client = getClient()
  const message = await client.messages.create({
    model: getModel(),
    max_tokens: 1024,
    system: 'You review Etsy digital-product listings for clarity and sales-effectiveness. Be specific and concrete — point at what is actually missing or unclear, not generic advice.',
    messages: [{
      role: 'user',
      content: `Review this Etsy listing. Score its clarity 1-10 and list concrete issues with suggested fixes.\n\n${contextSummary(context)}`,
    }],
    output_config: {
      format: {
        type: 'json_schema',
        schema: {
          type: 'object',
          properties: {
            score: { type: 'integer' },
            issues: {
              type: 'array',
              items: {
                type: 'object',
                properties: { summary: { type: 'string' }, suggestion: { type: 'string' } },
                required: ['summary', 'suggestion'],
                additionalProperties: false,
              },
            },
          },
          required: ['score', 'issues'],
          additionalProperties: false,
        },
      },
    },
  })
  const textBlock = message.content.find((block) => block.type === 'text')
  if (textBlock?.type !== 'text') return { score: 0, issues: [] }
  return JSON.parse(textBlock.text) as { score: number; issues: Array<{ summary: string; suggestion: string }> }
}
```

*Note for the implementing agent:* verify the exact `output_config.format`
shape and the `message.content` block-narrowing pattern against the
`typescript/claude-api/README.md` reference (Structured Outputs section)
before finalizing — the pseudocode above is illustrative, not
copy-paste-exact API syntax.

#### 2. `app/api/products/[name]/ai/route.ts`
Blueprint: `app/api/products/[name]/config/route.ts` (auth pattern only —
this route does not touch Prisma).

```ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { AiNotConfiguredError, generateDescription, suggestTags, reviewListing } from '@/lib/ai'
import type { TemplateData } from '@/lib/templates'

interface RouteContext {
  params: Promise<{ name: string }>
}

export async function POST(request: NextRequest, _context: RouteContext) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { action?: string; context?: TemplateData }
  try {
    body = JSON.parse(await request.text())
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  if (!body.context || !body.action) {
    return NextResponse.json({ error: 'Missing action or context' }, { status: 400 })
  }

  try {
    if (body.action === 'description') {
      return NextResponse.json({ description: await generateDescription(body.context) })
    }
    if (body.action === 'tags') {
      return NextResponse.json({ tags: await suggestTags(body.context) })
    }
    if (body.action === 'review') {
      return NextResponse.json(await reviewListing(body.context))
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (error) {
    if (error instanceof AiNotConfiguredError) {
      return NextResponse.json({ error: 'AI features are not configured' }, { status: 503 })
    }
    return NextResponse.json({ error: 'AI generation failed' }, { status: 502 })
  }
}
```

Note: `params` in `RouteContext` is unused today (context comes from the
body, not a DB lookup by product name) — keep the signature for
consistency with sibling routes, prefix unused with `_` as shown, or drop
the second param entirely if the implementing agent finds that cleaner and
lint-clean.

### Files to modify

#### 3. `components/EtsyListing.tsx`
- Remove `SUGGESTED_TAGS` constant.
- `refreshDescription()` → rewrite to POST
  `/api/products/${activeProduct}/ai` with
  `{ action: 'description', context: templateData }`; on success
  `setDescription(response.description)`; on failure set a small error
  state and render it inline (don't throw silently).
- Add `loadingDescription` boolean state; disable the "Generate
  Description" button and show a spinner/"Generating…" label while true.
- Suggest-tags button `onClick` → POST `{ action: 'tags', context:
  templateData }`, on success `onTagsChange([...etsyTags, ...response.tags
  .filter((tag) => !etsyTags.includes(tag)).slice(0, 13 - etsyTags.length)])`
  (still respect the 13-tag cap client-side as today, even though the
  prompt already asks the model to). Add a `loadingTags` boolean state,
  same disable/spinner treatment.
- New: "Review Listing" button + `reviewResult` state
  (`{ score: number; issues: [...] } | null`) + `loadingReview` boolean.
  POST `{ action: 'review', context: templateData }` (send current
  `description` state as `context.description` override if the user
  already generated/edited a preview — otherwise falls back to
  `config.description`). Render score + issue list below the button when
  present; placed near the readiness checklist section at the top of the
  component.
- Rename the button label "Refresh Description" → "Generate Description".

## Files Summary
| Action | Path | Blueprint |
|--------|------|-----------|
| CREATE | `lib/ai.ts` | `lib/db.ts` (singleton pattern) |
| CREATE | `app/api/products/[name]/ai/route.ts` | `app/api/products/[name]/config/route.ts` (auth pattern) |
| MODIFY | `components/EtsyListing.tsx` | itself (existing button wiring) |
| MODIFY | `package.json` | — add `@anthropic-ai/sdk` dependency |
| MODIFY | `.env.example` | — add Anthropic section |

## Out of Scope
- "Explain what's missing" and "Generate instructions" (deferred to a
  later phase).
- Any change to `ProductConfig`/Prisma schema — no persistence of AI
  output; it stays in component-local state exactly like today's preview
  description.
- Rate limiting / cost caps / usage tracking (POC scope — revisit if this
  goes to production traffic).
- Streaming responses (not needed — outputs are short).
- A dedicated "AI Assist" panel UI (explicitly deferred in favor of
  upgrading existing buttons in place).

## Tests (mandatory per project rule, kept lean per POC scope)
- `tests/unit/ai-context.test.ts` (or extend an existing unit file) — if
  any pure helper is extracted from `lib/ai.ts` (e.g. a tag-count-capping
  helper), unit test it. The three generation functions themselves call
  the network and are not unit-testable without mocking the SDK — cover
  those via the integration test below instead.
- `tests/integration/ai.test.ts` (new) — mock `@anthropic-ai/sdk` and
  `@/auth` with `mock.module()` (same convention as
  `tests/integration/products.test.ts`), POST to the route for all three
  actions, assert: 401 without a session, 400 on missing
  action/context, 503 when `ANTHROPIC_API_KEY` is unset, 200 with the
  expected shape on success, 502 when the mocked client throws.
- `tests/e2e/ai-listing.spec.ts` (new, single lean flow) — dev-bypass
  sign-in, open a product in the factory page, click "Generate
  Description," confirm the preview populates (mock or accept a real call
  if `ANTHROPIC_API_KEY` is present in the test env — if not, this test
  should skip gracefully rather than fail, since a real API key won't be
  available in CI). Keep this to one happy-path flow, not exhaustive
  per-button coverage — POC scope.

## Verification
1. `npx tsc --noEmit`, `bun test tests/unit`, `bun test tests/integration`.
2. Set `ANTHROPIC_API_KEY` in `.env` (leave `ANTHROPIC_MODEL` unset to
   confirm the `claude-sonnet-5` default applies).
3. `npm run dev`, open a product in `/app/factory`, click "Generate
   Description" — confirm real generated text appears (not the old
   template mail-merge), referencing the actual product name/files/price.
4. Click "Suggest" tags — confirm new tags appear that are plausibly
   related to the actual product (not the old generic
   `SUGGESTED_TAGS` list).
5. Click "Review Listing" — confirm a score + concrete issues render.
6. Temporarily unset `ANTHROPIC_API_KEY`, retry one action — confirm a
   clean "AI features are not configured" message surfaces in the UI
   instead of a crash or silent failure.
