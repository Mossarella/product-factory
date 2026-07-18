import Anthropic from '@anthropic-ai/sdk'
import type { TemplateData } from './templates'

export class AiNotConfiguredError extends Error {}

function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new AiNotConfiguredError('ANTHROPIC_API_KEY is not set')
  }

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
  const message = await client.beta.messages.create({
    model: getModel(),
    max_tokens: 512,
    system: 'You suggest Etsy search tags for digital products. Etsy tags must each be 20 characters or fewer. Never repeat a tag already in use.',
    messages: [{
      role: 'user',
      content: `Suggest new Etsy tags for this product. It already has ${context.etsyTags.length}/13 tags used; suggest at most ${13 - context.etsyTags.length} new ones.\n\n${contextSummary(context)}`,
    }],
    betas: ['structured-outputs-2025-11-13'],
    output_format: {
      type: 'json_schema',
      schema: {
        type: 'object',
        properties: { tags: { type: 'array', items: { type: 'string' } } },
        required: ['tags'],
        additionalProperties: false,
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
  const message = await client.beta.messages.create({
    model: getModel(),
    max_tokens: 1024,
    system: 'You review Etsy digital-product listings for clarity and sales-effectiveness. Be specific and concrete — point at what is actually missing or unclear, not generic advice.',
    messages: [{
      role: 'user',
      content: `Review this Etsy listing. Score its clarity 1-10 and list concrete issues with suggested fixes.\n\n${contextSummary(context)}`,
    }],
    betas: ['structured-outputs-2025-11-13'],
    output_format: {
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
  })
  const textBlock = message.content.find((block) => block.type === 'text')

  if (textBlock?.type !== 'text') return { score: 0, issues: [] }
  return JSON.parse(textBlock.text) as { score: number; issues: Array<{ summary: string; suggestion: string }> }
}
