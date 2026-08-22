# One-Time Upgrade Model

## Recommendation

Use **one-time lifetime licenses with capacity tiers**, not subscriptions. The first paid tier can be the 500-product / 5 GB plan. A customer who reaches the limit can purchase a higher-capacity tier and pay only the difference between the tiers when an upgrade path exists.

| Tier | Active products | Private storage | Maximum upload | Etsy |
|---|---:|---:|---:|---|
| Free | 3 | 100 MB | 10 MB | Disabled |
| Creator | 500 | 5 GB | 100 MB | 1 pinned shop |
| Studio | 2,000 | 25 GB | 250 MB | 1 pinned shop |
| Agency | 10,000 | 100 GB | 1 GB | 1 pinned shop initially |

The upper tiers remain bounded. They are not an unlimited-storage promise. The values are launch defaults and can be changed before pricing is published.

## Upgrade behavior

When a user reaches a product or storage limit, the API returns a structured `QUOTA_EXCEEDED` response containing the quota type, current usage, current limit, and the next available tier. The HUD displays the usage and an **Upgrade capacity** action.

The upgrade page shows the current tier, the target tier, the additional product and storage capacity, the one-time price, and the amount credited for the existing tier. The user confirms a single purchase. The entitlement is not changed until the payment provider confirms the completed payment through a signed server-to-server event.

If a user already owns Creator and purchases Studio, the system records Studio as the active tier and preserves all existing products and files. No migration, export, or re-upload is required. Downgrades should not be offered automatically because existing data may exceed the lower tier; a downgrade can be handled manually later after the user removes enough data.

## Payment and entitlement records

The existing `profiles.plan` field is sufficient for the initial free/paid distinction, but higher tiers need a separate entitlement record. The record should contain the owner ID, tier key, payment-provider customer ID, payment-provider transaction or order ID, purchase timestamp, and optional superseded-entitlement ID.

The payment completion handler must be idempotent. Replayed payment events must not create duplicate entitlements or double-count credits. The application should grant the tier only after verifying the provider signature and matching the purchase to the authenticated account through a signed checkout reference or server-created checkout session.

## Credit policy

For upgrades purchased within a defined window, credit the original purchase toward the new tier. This should be implemented as a fixed tier-price difference, not a time-based proration calculation. For example, if Creator costs 49 and Studio costs 99, a Creator owner pays 50 for Studio.

Do not allow a user to buy a lower tier merely to reset quota. The entitlement is permanently tied to the account and the highest successfully purchased tier. Refunds or chargebacks should suspend the associated paid capability while preserving the user’s data for a defined grace period.

## Storage safeguards

An upgrade increases the quota; it does not automatically create or retain more files. Storage remains private, owner-scoped, and subject to per-file limits. The system should continue deleting failed temporary uploads and applying release-artifact retention rules. If a future tier would create unacceptable infrastructure exposure, purchases for that tier can be disabled without affecting existing lower tiers.

## Recommended launch sequence

Launch only Free and Creator first. Implement the entitlement abstraction so Studio and Agency can be added by configuration later. Do not expose hypothetical tiers or prices in the UI until payment products, quota values, refund behavior, and support procedures are ready.


## Stripe implementation

The initial Creator purchase is implemented through Stripe Checkout in `GET /api/buy`. The route requires an authenticated Supabase user, creates a server-side one-time Checkout Session using `STRIPE_CREATOR_PRICE_ID`, and places the authenticated owner ID and tier in both Checkout metadata and the payment-intent metadata.

Stripe calls `POST /api/stripe/webhook` after payment. The route verifies the raw request body with `STRIPE_WEBHOOK_SECRET`, accepts only paid `checkout.session.completed` and `payment_intent.succeeded` events, and records the purchase idempotently by Stripe order ID. It then grants the Creator entitlement through the service-role Supabase client and updates the profile’s paid status. The browser return URL is informational only; it never grants access.

Before launch, create a one-time Creator Price in Stripe, set `STRIPE_SECRET_KEY`, `STRIPE_CREATOR_PRICE_ID`, and `STRIPE_WEBHOOK_SECRET`, and register the exact production webhook URL for `checkout.session.completed` and `payment_intent.succeeded`. Use Stripe test mode with Stripe CLI forwarding or a test webhook endpoint before switching to live mode. Higher tiers should use separate one-time Prices and the same server-created metadata and webhook fulfillment path.


## Test-mode launch checklist

Before testing, configure `STRIPE_SECRET_KEY`, `STRIPE_CREATOR_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`, and `NEXT_PUBLIC_APP_URL` in the deployed server environment. Do not expose the secret key or webhook secret through a `NEXT_PUBLIC_*` variable.

Create a one-time Creator Price in Stripe test mode, register `POST /api/stripe/webhook`, and subscribe the endpoint to `checkout.session.completed` and `payment_intent.succeeded`. Complete one checkout from `/api/buy` using a Stripe test card. Confirm that the webhook response is successful, `billing_purchases` contains one completed Stripe order, `account_entitlements` contains the Creator tier, and the Factory HUD shows the expanded quota.

Replay the same webhook event and confirm that the unique Stripe order ID prevents duplicate purchase records. Then sign in as a second Supabase owner and verify that the second owner cannot read the first owner’s products, releases, Etsy records, entitlement, or billing purchase. Only after these checks pass should live Stripe mode and the production webhook endpoint be enabled.
