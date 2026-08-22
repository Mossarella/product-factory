# Etsy API Research

Research date: 2026-08-14.

## Official sources

- Authentication: https://developers.etsy.com/documentation/essentials/authentication
- Listings tutorial: https://developer.etsy.com/documentation/tutorials/listings
- API reference: https://developers.etsy.com/documentation/reference
- Webhooks: https://developers.etsy.com/documentation/essentials/webhooks

## Verified capabilities

Etsy Open API v3 is a REST API. Every request requires an `x-api-key` header containing the Etsy keystring and shared secret. Private data and write operations additionally require OAuth 2.0 user authorization. The authorization-code flow uses a registered HTTPS callback URL, state, and PKCE. Access tokens last about one hour and refresh tokens are supplied for renewal.

The listings API supports creating draft listings, updating listings, reading shop listings, uploading listing files, uploading listing images, and updating listing inventory. For digital products, the documented flow is to create a draft listing, upload or associate the digital product file, and set the listing type to `download`. Creating or activating a listing requires Etsy-specific fields such as title, description, price, quantity, taxonomy, and image/file requirements. Listing management requires `listings_r` and `listings_w` scopes; deletion additionally requires `listings_d`.

The API reference exposes inventory endpoints including `getListingInventory`, `updateListingInventory`, and `getListingsInventoryByListingIds`. Shop listing endpoints include `getListingsByShop` and `getListing`. Therefore, Product Factory can fetch a seller's existing Etsy listings and inventory into a local, owner-scoped cache for matching and import.

Etsy documents webhooks, but the currently listed events are order lifecycle events: `order.paid`, `order.canceled`, `order.shipped`, and `order.delivered`. The documentation does not list a listing-created or inventory-changed webhook. Inventory refresh should therefore initially use explicit user-triggered fetch plus optional low-frequency polling, rather than assuming a real-time inventory webhook.

## Product Factory implications

A one-click Etsy publish flow is feasible, but it is a multi-step server-side transaction: create draft listing, upload the release ZIP as the digital listing file, upload or associate listing images, update the listing to the download type and desired state, and persist Etsy IDs/status in Supabase. It must use per-user OAuth tokens and never expose the Etsy client secret or access/refresh tokens to the browser.

A one-click inventory fetch is also feasible: connect the seller's Etsy shop, fetch listings and inventory, normalize them into an owner-scoped synchronization table, and provide a match/import action into Product Factory stock. Because Product Factory is a virtual stockroom and not sales analytics, the imported data should be limited to product identity, Etsy listing ID, state, SKU, quantity/offerings, price, and selected metadata needed for matching—not performance dashboards.

## Webhook verification update

Official Etsy documentation confirms webhook support for approved commercial and personal applications at https://developers.etsy.com/documentation/essentials/webhooks. The currently documented events are `order.paid`, `order.canceled`, `order.shipped`, and `order.delivered`; Etsy does not document a general listing or inventory-change webhook event. Each delivery includes `event_type`, `resource_url`, and `shop_id`, plus `webhook-id`, `webhook-timestamp`, and `webhook-signature` headers. Signature verification uses `webhook-id + "." + webhook-timestamp + "." + raw_body`, HMAC-SHA256 with the base64-decoded signing secret after removing the `whsec_` prefix, and a replay timestamp tolerance. Etsy retries failed deliveries with exponential backoff. Source: https://developers.etsy.com/documentation/essentials/webhooks
