import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'bun:test'
import { verifyEtsyWebhookSignature } from '@/lib/etsy/oauth'

const secretBytes = Buffer.from('etsy-webhook-test-secret-32-bytes!!')
const signingSecret = `whsec_${secretBytes.toString('base64')}`

function signatureFor(input: { body: string; webhookId: string; webhookTimestamp: string }) {
  return createHmac('sha256', secretBytes)
    .update(`${input.webhookId}.${input.webhookTimestamp}.${input.body}`)
    .digest('base64')
}

describe('Etsy webhook signatures', () => {
  it('accepts a valid signature with a fresh timestamp', () => {
    const input = { body: '{"event_type":"order.paid"}', webhookId: 'evt_123', webhookTimestamp: '1700000000' }
    const signature = signatureFor(input)

    expect(verifyEtsyWebhookSignature({
      ...input,
      webhookSignature: `v1,${signature}`,
      signingSecret,
      nowSeconds: 1700000100,
    })).toBe(true)
  })

  it('accepts any matching signature in a multi-signature header', () => {
    const input = { body: '{"shop_id":123}', webhookId: 'evt_456', webhookTimestamp: '1700000000' }
    const signature = signatureFor(input)

    expect(verifyEtsyWebhookSignature({
      ...input,
      webhookSignature: `v1,old-signature v1,${signature}`,
      signingSecret,
      nowSeconds: 1700000100,
    })).toBe(true)
  })

  it('rejects tampered bodies and invalid signatures', () => {
    const input = { body: '{"shop_id":123}', webhookId: 'evt_789', webhookTimestamp: '1700000000' }
    const signature = signatureFor(input)

    expect(verifyEtsyWebhookSignature({
      ...input,
      body: '{"shop_id":999}',
      webhookSignature: `v1,${signature}`,
      signingSecret,
      nowSeconds: 1700000100,
    })).toBe(false)
  })

  it('rejects stale webhook timestamps to prevent replay', () => {
    const input = { body: '{}', webhookId: 'evt_old', webhookTimestamp: '1700000000' }
    const signature = signatureFor(input)

    expect(verifyEtsyWebhookSignature({
      ...input,
      webhookSignature: `v1,${signature}`,
      signingSecret,
      nowSeconds: 1700000401,
      toleranceSeconds: 300,
    })).toBe(false)
  })
})
