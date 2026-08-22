# Product Factory One-Time Quota Policy

## Decision

Product Factory will use a **one-time purchase** for the core workflow. The paid entitlement unlocks Etsy connection, inventory sync, draft publishing, and higher product and storage limits. It does not promise unlimited storage or unlimited retained build history.

The free tier remains useful for learning the virtual-stock workflow, but it is deliberately bounded and cannot use Etsy synchronization or publishing.

## Initial entitlements

| Capability | Free | One-time paid |
|---|---:|---:|
| Active products | 3 | 500 |
| Storage quota | 100 MB | 5 GB |
| Maximum individual upload | 10 MB | 100 MB |
| Etsy shop connections | 0 | 1 pinned shop |
| Etsy inventory sync | No | Yes |
| Etsy draft publishing | No | Yes |
| Release bundle retention | Latest bundle per product | Latest 3 bundles per product |
| Product metadata and packaging | Yes | Yes |

These values are configuration defaults, not hard-coded UI promises. They must be enforced on the server and surfaced from one entitlement helper so they can be adjusted without rewriting every route.

## Storage controls

The application must never offer unlimited retained storage. Every upload and generated release must pass an owner-scoped quota check before bytes are written. Quota usage is calculated from Product Factory-owned metadata rows and private Storage objects, with reservations for in-flight uploads so concurrent requests cannot bypass the limit.

The paid storage quota is intentionally a pooled cap. A user with 5,000 tiny products may still reach the product-count limit, while a user with a few large products may reach the byte limit first. Both limits are required.

Generated ZIPs are treated as replaceable build artifacts rather than permanent history. The application keeps the configured number of recent release bundles and removes older private Storage objects after a successful replacement. Product metadata, Etsy request snapshots, and release manifests remain lightweight and do not count as large binary storage.

## Enforcement rules

Quota checks run in protected server routes and in a database transaction or RPC that atomically checks the owner entitlement, product count, current bytes, and reserved bytes. Client-side disabled buttons are only presentation; they are not security controls.

The following operations must enforce entitlements:

1. Creating or duplicating a product checks the active-product limit.
2. Uploading product files, fixed assets, and build inputs checks per-file and pooled byte limits.
3. Building or finalizing a release checks the release artifact size and retention policy.
4. Etsy connect, inventory sync, and draft publishing require the paid entitlement.
5. Deleting products or artifacts releases quota immediately after metadata and Storage cleanup.
6. Every query and quota record remains owner-scoped through Supabase RLS and server-side owner filters.

## Abuse and cost containment

The service must reject oversized uploads before reading the complete body where possible, reject repeated duplicate uploads when the same owner already has the asset, and avoid retaining temporary ZIPs after failed or completed transfers. Storage objects must remain private and use owner-prefixed paths.

A future plan expansion can add purchased storage packs or a higher one-time tier, but the first paid plan must remain a bounded product with a clear maximum liability. If the quota is reached, the user sees a clear upgrade or cleanup message rather than silently accumulating storage.

## Out of scope

This policy does not add marketplace analytics, order tracking, webhooks, background synchronization, team sharing, or recurring subscription infrastructure. Those features would create recurring service value and can be evaluated separately if the product direction changes.
