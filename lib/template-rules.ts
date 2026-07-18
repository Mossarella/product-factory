import type { ProductConfig } from './types'

export interface VariantChecklistRule {
  id: string
  type: 'variant_checklist'
  label: string
  required: boolean
  folder: string
  expectedVariants: string[]
}

export interface FileTypePresentRule {
  id: string
  type: 'file_type_present'
  label: string
  required: boolean
  folder?: string
  extensions: string[]
}

export interface FieldPresentRule {
  id: string
  type: 'field_present'
  label: string
  required: boolean
  field: 'description' | 'notes' | 'etsyTitle' | 'contact'
}

export type TemplateRule = VariantChecklistRule | FileTypePresentRule | FieldPresentRule

export interface ValidationResult {
  ruleId: string
  label: string
  required: boolean
  status: 'ok' | 'missing'
  detail?: string
}

export function validateProduct(config: ProductConfig, rules: TemplateRule[]): ValidationResult[] {
  return rules.map((rule) => {
    if (rule.type === 'variant_checklist') {
      const present = new Set(
        config.mascotFiles.filter((f) => f.folder === rule.folder).map((f) => f.variant),
      )
      const missing = rule.expectedVariants.filter((v) => !present.has(v))
      return {
        ruleId: rule.id, label: rule.label, required: rule.required,
        status: missing.length === 0 ? 'ok' : 'missing',
        detail: missing.length > 0
          ? `Missing: ${missing.join(', ')}`
          : `${rule.expectedVariants.length}/${rule.expectedVariants.length} found`,
      }
    }
    if (rule.type === 'file_type_present') {
      const files = rule.folder ? config.mascotFiles.filter((f) => f.folder === rule.folder) : config.mascotFiles
      const found = files.some((f) =>
        rule.extensions.some((ext) => f.origName.toLowerCase().endsWith(`.${ext.toLowerCase().replace(/^\./, '')}`)),
      )
      return { ruleId: rule.id, label: rule.label, required: rule.required, status: found ? 'ok' : 'missing' }
    }
    // field_present
    const value = config[rule.field]
    const found = typeof value === 'string' && value.trim().length > 0
    return { ruleId: rule.id, label: rule.label, required: rule.required, status: found ? 'ok' : 'missing' }
  })
}
