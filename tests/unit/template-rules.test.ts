import { describe, expect, it } from 'bun:test'
import { validateProduct } from '@/lib/template-rules'
import type { ProductConfig, MascotFile } from '@/lib/types'
import type { TemplateRule } from '@/lib/template-rules'

const BASE: ProductConfig = {
  name: '',
  sku: '',
  productName: '',
  etsyTitle: '',
  description: '',
  notes: '',
  contact: '',
  price: 0,
  currency: '',
  licenseType: 'personal',
  folders: [],
  mascotFiles: [],
  etsyTags: [],
  complete: false,
  createdAt: '',
}

const file = (overrides: Partial<MascotFile> = {}): MascotFile => ({
  id: 'file-1',
  filename: 'file-1.pdf',
  origName: 'file.pdf',
  folder: 'Main',
  variant: 'Front',
  ...overrides,
})

describe('validateProduct()', () => {
  it('marks a variant checklist ok when every expected variant is in its folder', () => {
    const rule: TemplateRule = {
      id: 'views', type: 'variant_checklist', label: 'Views', required: true,
      folder: 'PNG', expectedVariants: ['Front', 'Back'],
    }

    expect(validateProduct({ ...BASE, mascotFiles: [
      file({ folder: 'PNG', variant: 'Front' }),
      file({ id: 'file-2', folder: 'PNG', variant: 'Back' }),
    ] }, [rule])).toEqual([{
      ruleId: 'views', label: 'Views', required: true, status: 'ok', detail: '2/2 found',
    }])
  })

  it('lists missing variants in expected order', () => {
    const rule: TemplateRule = {
      id: 'views', type: 'variant_checklist', label: 'Views', required: true,
      folder: 'PNG', expectedVariants: ['Front', 'Back', 'Side'],
    }

    const [result] = validateProduct({ ...BASE, mascotFiles: [file({ folder: 'PNG', variant: 'Front' })] }, [rule])
    expect(result.status).toBe('missing')
    expect(result.detail).toBe('Missing: Back, Side')
  })

  it('does not count matching variants from a different folder', () => {
    const rule: TemplateRule = {
      id: 'views', type: 'variant_checklist', label: 'Views', required: true,
      folder: 'PNG', expectedVariants: ['Front'],
    }

    const [result] = validateProduct({ ...BASE, mascotFiles: [file({ folder: 'SVG', variant: 'Front' })] }, [rule])
    expect(result.status).toBe('missing')
    expect(result.detail).toBe('Missing: Front')
  })

  it('reports all variants missing when there are no mascot files', () => {
    const rule: TemplateRule = {
      id: 'views', type: 'variant_checklist', label: 'Views', required: true,
      folder: 'PNG', expectedVariants: ['Front', 'Back'],
    }

    expect(validateProduct(BASE, [rule])[0].detail).toBe('Missing: Front, Back')
  })

  it('finds a matching file type anywhere when no folder is specified', () => {
    const rule: TemplateRule = {
      id: 'pdf', type: 'file_type_present', label: 'PDF', required: true, extensions: ['pdf'],
    }

    expect(validateProduct({ ...BASE, mascotFiles: [file({ folder: 'Downloads', origName: 'guide.pdf' })] }, [rule])[0].status).toBe('ok')
  })

  it('does not count a matching file type from a different required folder', () => {
    const rule: TemplateRule = {
      id: 'pdf', type: 'file_type_present', label: 'PDF', required: true, folder: 'Downloads', extensions: ['pdf'],
    }

    expect(validateProduct({ ...BASE, mascotFiles: [file({ folder: 'Source', origName: 'guide.pdf' })] }, [rule])[0].status).toBe('missing')
  })

  it('matches file types case-insensitively', () => {
    const rule: TemplateRule = {
      id: 'pdf', type: 'file_type_present', label: 'PDF', required: true, extensions: ['PDF'],
    }

    expect(validateProduct({ ...BASE, mascotFiles: [file({ origName: 'guide.PDF' })] }, [rule])[0].status).toBe('ok')
  })

  it('returns missing without detail when no file type matches', () => {
    const rule: TemplateRule = {
      id: 'pdf', type: 'file_type_present', label: 'PDF', required: true, extensions: ['pdf'],
    }

    const [result] = validateProduct({ ...BASE, mascotFiles: [file({ origName: 'guide.png' })] }, [rule])
    expect(result.status).toBe('missing')
    expect(result.detail).toBe(undefined)
  })

  it('requires each field_present field to contain non-whitespace text', () => {
    const fields = ['description', 'notes', 'etsyTitle', 'contact'] as const

    for (const field of fields) {
      const rule: TemplateRule = {
        id: field, type: 'field_present', label: field, required: true, field,
      }
      expect(validateProduct({ ...BASE, [field]: '  present  ' }, [rule])[0].status).toBe('ok')
      expect(validateProduct({ ...BASE, [field]: '' }, [rule])[0].status).toBe('missing')
      expect(validateProduct({ ...BASE, [field]: '   ' }, [rule])[0].status).toBe('missing')
    }
  })

  it('preserves required for both required and optional missing rules', () => {
    const rules: TemplateRule[] = [
      { id: 'required-description', type: 'field_present', label: 'Description', required: true, field: 'description' },
      { id: 'optional-notes', type: 'field_present', label: 'Notes', required: false, field: 'notes' },
    ]

    const results = validateProduct(BASE, rules)
    expect(results[0].status).toBe('missing')
    expect(results[0].required).toBe(true)
    expect(results[1].status).toBe('missing')
    expect(results[1].required).toBe(false)
  })

  it('returns one ordered result for each mixed rule', () => {
    const rules: TemplateRule[] = [
      { id: 'description', type: 'field_present', label: 'Description', required: true, field: 'description' },
      { id: 'pdf', type: 'file_type_present', label: 'PDF', required: false, extensions: ['pdf'] },
      { id: 'views', type: 'variant_checklist', label: 'Views', required: true, folder: 'PNG', expectedVariants: ['Front'] },
    ]

    const results = validateProduct({
      ...BASE,
      description: 'Ready',
      mascotFiles: [file({ folder: 'PNG', variant: 'Front', origName: 'asset.pdf' })],
    }, rules)
    expect(results.map((result) => result.ruleId)).toEqual(['description', 'pdf', 'views'])
    expect(results.map((result) => result.status)).toEqual(['ok', 'ok', 'ok'])
  })
})
