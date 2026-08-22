'use client'

import { validateProduct, type TemplateRule } from '@/lib/template-rules'
import type { ProductConfig } from '@/lib/types'

interface Props {
  config: ProductConfig
  rules: TemplateRule[]
}

export function TemplateValidation({ config, rules }: Props) {
  if (rules.length === 0) return null
  const results = validateProduct(config, rules)
  return (
    <div className="space-y-2 font-mono text-sm">
      <p className="text-xs uppercase tracking-widest text-zinc-600">Template validation:</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {results.map((result) => {
          const glyph = result.status === 'ok' ? '✓' : result.required ? '✗' : '⚠'
          const color = result.status === 'ok' ? 'text-emerald-500' : result.required ? 'text-red-400' : 'text-yellow-400'
          return (
            <div key={result.ruleId} className={color} title={result.detail}>
              <span>{glyph} {result.label}{result.detail ? ` — ${result.detail}` : ''}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
