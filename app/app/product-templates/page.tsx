'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { FieldPresentRule, TemplateRule } from '@/lib/template-rules'

type ProductTemplate = { id: string; name: string; assets: string[]; rules: TemplateRule[] }

const ASSET_TYPES = [
  { key: 'readme', label: 'README', description: 'Text file with product info', icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="2" width="16" height="20" rx="2" stroke="currentColor" strokeWidth="1.5"/><path d="M8 7H16M8 11H16M8 15H12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg> },
  { key: 'license', label: 'License', description: 'License agreement file', icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2L20 6V12C20 16.4 16.4 20.4 12 22C7.6 20.4 4 16.4 4 12V6L12 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/><path d="M9 12L11 14L15 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg> },
  { key: 'thankyou', label: 'Thank You Card', description: 'THANKYOU.png bundled in ZIP', icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 21C12 21 3 15 3 9C3 6.24 5.24 4 8 4C9.6 4 11 4.8 12 6C13 4.8 14.4 4 16 4C18.76 4 21 6.24 21 9C21 15 12 21 12 21Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg> },
  { key: 'howto', label: 'How To Use', description: 'HOWTO.png bundled in ZIP', icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5"/><path d="M12 8C12 8 10 9 10 11C10 12.1 10.9 13 12 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><circle cx="12" cy="16" r="0.75" fill="currentColor"/></svg> },
]

const RULE_TYPES: Array<{ value: TemplateRule['type']; label: string }> = [
  { value: 'variant_checklist', label: 'Expected files checklist' },
  { value: 'file_type_present', label: 'File type required' },
  { value: 'field_present', label: 'Field required' },
]

const FIELD_OPTIONS: Array<{ value: FieldPresentRule['field']; label: string }> = [
  { value: 'description', label: 'Description' },
  { value: 'notes', label: 'README notes' },
  { value: 'etsyTitle', label: 'Etsy title' },
  { value: 'contact', label: 'Contact' },
]

function defaultRule(): TemplateRule {
  return { id: crypto.randomUUID(), type: 'variant_checklist', label: '', required: true, folder: '', expectedVariants: [] }
}

export default function ProductTemplatesPage() {
  const [templates, setTemplates] = useState<ProductTemplate[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editAssets, setEditAssets] = useState<string[]>([])
  const [editRules, setEditRules] = useState<TemplateRule[]>([])
  const [saving, setSaving] = useState(false)
  const [newAssetName, setNewAssetName] = useState('')
  const [addError, setAddError] = useState('')
  const [chipInputs, setChipInputs] = useState<Record<string, string>>({})

  useEffect(() => {
    fetch('/api/product-templates')
      .then(async (response) => (response.ok ? response.json() as Promise<ProductTemplate[]> : []))
      .then((data) => { setTemplates(data); if (data.length > 0) select(data[0]) })
      .catch(() => setTemplates([]))
  }, [])

  function select(template: ProductTemplate) {
    setSelectedId(template.id)
    setEditName(template.name)
    setEditAssets(template.assets)
    setEditRules(template.rules ?? [])
  }

  async function createTemplate() {
    const response = await fetch('/api/product-templates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Untitled', assets: [], rules: [] }) })
    if (!response.ok) return
    const template: ProductTemplate = await response.json()
    setTemplates((previous) => [...previous, template])
    select(template)
  }

  async function save() {
    if (!selectedId) return
    setSaving(true)
    const response = await fetch(`/api/product-templates/${selectedId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: editName, assets: editAssets, rules: editRules }) })
    if (!response.ok) { setSaving(false); return }
    const updated: ProductTemplate = await response.json()
    setTemplates((previous) => previous.map((template) => template.id === selectedId ? updated : template))
    setSaving(false)
  }

  async function deleteTemplate() {
    if (!selectedId) return
    await fetch(`/api/product-templates/${selectedId}`, { method: 'DELETE' })
    const next = templates.filter((template) => template.id !== selectedId)
    setTemplates(next)
    if (next.length > 0) select(next[0])
    else { setSelectedId(null); setEditName(''); setEditAssets([]); setEditRules([]) }
  }

  function toggleAsset(key: string) { setEditAssets((previous) => previous.includes(key) ? previous.filter((asset) => asset !== key) : [...previous, key]) }
  function addOtherAsset() {
    const trimmed = newAssetName.trim()
    if (!trimmed) return
    if (editAssets.some((asset) => asset.toLowerCase() === trimmed.toLowerCase())) { setAddError('Already added.'); return }
    toggleAsset(trimmed); setNewAssetName(''); setAddError('')
  }
  function addRule() { setEditRules((previous) => [...previous, defaultRule()]) }
  function updateRule(id: string, updates: Partial<TemplateRule>) { setEditRules((previous) => previous.map((rule) => rule.id === id ? { ...rule, ...updates } as TemplateRule : rule)) }
  function removeRule(id: string) {
    setEditRules((previous) => previous.filter((rule) => rule.id !== id))
    setChipInputs((previous) => { const next = { ...previous }; delete next[id]; return next })
  }
  function changeRuleType(id: string, type: TemplateRule['type']) {
    setEditRules((previous) => previous.map((rule): TemplateRule => {
      if (rule.id !== id) return rule
      if (type === 'variant_checklist') return { id: rule.id, type: 'variant_checklist', label: rule.label, required: rule.required, folder: '', expectedVariants: [] }
      if (type === 'file_type_present') return { id: rule.id, type: 'file_type_present', label: rule.label, required: rule.required, folder: undefined, extensions: [] }
      return { id: rule.id, type: 'field_present', label: rule.label, required: rule.required, field: 'description' }
    }))
  }
  function addChip(ruleId: string, list: 'expectedVariants' | 'extensions') {
    const value = (chipInputs[ruleId] ?? '').trim()
    if (!value) return
    setEditRules((previous) => previous.map((rule) => {
      if (rule.id !== ruleId) return rule
      if (rule.type === 'variant_checklist' && list === 'expectedVariants') return rule.expectedVariants.includes(value) ? rule : { ...rule, expectedVariants: [...rule.expectedVariants, value] }
      if (rule.type === 'file_type_present' && list === 'extensions') { const extension = value.replace(/^\./, ''); return rule.extensions.includes(extension) ? rule : { ...rule, extensions: [...rule.extensions, extension] } }
      return rule
    }))
    setChipInputs((previous) => ({ ...previous, [ruleId]: '' }))
  }
  function removeChip(ruleId: string, list: 'expectedVariants' | 'extensions', value: string) {
    setEditRules((previous) => previous.map((rule) => {
      if (rule.id !== ruleId) return rule
      if (rule.type === 'variant_checklist' && list === 'expectedVariants') return { ...rule, expectedVariants: rule.expectedVariants.filter((item) => item !== value) }
      if (rule.type === 'file_type_present' && list === 'extensions') return { ...rule, extensions: rule.extensions.filter((item) => item !== value) }
      return rule
    }))
  }

  const selected = templates.find((template) => template.id === selectedId)
  const customAssetNames = editAssets.filter((asset) => !ASSET_TYPES.some((type) => type.key === asset))
  const fieldItems = FIELD_OPTIONS
  const requiredItems = [{ value: 'required', label: 'Required' }, { value: 'optional', label: 'Optional' }]

  return <div className="min-h-screen min-w-0 p-5 sm:p-8">
    <div className="mb-8 border-b border-white/10 pb-6"><div className="mb-2 flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.28em] text-violet-300/70"><span className="h-1.5 w-1.5 bg-violet-400 shadow-[0_0_10px_rgba(167,139,250,.9)]" /> Loadout / templates</div><h1 className="text-2xl font-black uppercase tracking-tight text-zinc-100 font-mono">Product Templates</h1><p className="mt-1 text-xs font-mono text-zinc-500">Preset bundles and validation rules attached to each product.</p></div>
    <div className="flex min-w-0 flex-col gap-5 lg:h-[calc(100vh-200px)] lg:flex-row">
      <div className="flex w-full shrink-0 flex-col gap-1 lg:w-52">
        <Button variant="outline" onClick={createTemplate} className="w-full border-dashed border-zinc-700 hover:border-violet-600 hover:text-violet-400 px-3 py-2 text-xs text-zinc-500 font-mono transition-colors mb-2">+ New Template</Button>
        {templates.length === 0 && <p className="text-xs text-zinc-600 font-mono px-1">No templates yet.</p>}
        <Tabs orientation="vertical" value={selectedId} onValueChange={(id) => { const template = templates.find((item) => item.id === id); if (template) select(template) }}>
          <TabsList className="h-fit w-full flex-col items-stretch bg-transparent p-0 lg:w-52">{templates.map((template) => <TabsTrigger key={template.id} value={template.id} className="justify-start rounded-none border-transparent px-3 py-2 text-sm font-mono text-zinc-500 transition-colors hover:bg-zinc-800/40 hover:text-zinc-300 data-active:border-l-2 data-active:border-violet-500 data-active:bg-zinc-800/60 data-active:text-zinc-100 data-active:shadow-none">{template.name}</TabsTrigger>)}</TabsList>
        </Tabs>
      </div>
      {selected ? <div className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto pr-1">
        <Card className="mb-4 bg-zinc-900/45 p-5 ring-1 ring-inset ring-violet-400/5 sm:p-6">
          <div className="mb-6"><Label className="block text-xs uppercase tracking-widest text-zinc-600 font-mono mb-2">Template name</Label><Input value={editName} onChange={(event) => setEditName(event.target.value)} className="border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 font-mono focus:border-violet-500 focus:outline-none w-64" /></div>
          <div className="mb-6"><label className="block text-xs uppercase tracking-widest text-zinc-600 font-mono mb-3">Included assets</label><div className="grid grid-cols-2 gap-3 max-w-lg">{ASSET_TYPES.map((asset) => { const active = editAssets.includes(asset.key); return <button key={asset.key} onClick={() => toggleAsset(asset.key)} className={`text-left border p-4 transition-colors ${active ? 'border-violet-500 bg-violet-500/10 text-violet-300' : 'border-zinc-700 bg-zinc-900 text-zinc-500 hover:border-zinc-600 hover:text-zinc-400'}`}><div className="mb-2">{asset.icon}</div><p className="text-sm font-bold font-mono">{asset.label}</p><p className="text-xs mt-0.5 opacity-70 font-mono">{asset.description}</p></button> })}</div>
          {customAssetNames.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{customAssetNames.map((name) => <Badge key={name} variant="outline" className="h-auto rounded-none border-zinc-700 bg-zinc-900 px-2 py-1 font-mono font-normal text-zinc-300"><span>{name}</span><button type="button" aria-label={`Remove ${name}`} className="text-zinc-500 hover:text-red-400" onClick={() => toggleAsset(name)}>✕</button></Badge>)}</div>}
          <div className="mt-3 flex flex-wrap items-start gap-2"><Input placeholder="Custom asset name" value={newAssetName} onChange={(event) => { setNewAssetName(event.target.value); setAddError('') }} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addOtherAsset() } }} className="w-56" /><Button variant="outline" onClick={addOtherAsset}>+ Add other</Button>{addError && <p className="mt-1 basis-full text-xs text-red-400">{addError}</p>}</div></div>
          <div className="flex gap-3"><Button variant="default" onClick={save} disabled={saving} className="border border-violet-600 bg-violet-600 px-4 py-2 text-sm text-zinc-100 hover:bg-violet-500 disabled:opacity-50 font-mono transition-colors">{saving ? 'Saving…' : 'Save changes'}</Button><Button variant="outline" onClick={deleteTemplate} className="border border-zinc-700 px-4 py-2 text-sm text-zinc-500 hover:border-red-700 hover:text-red-400 font-mono transition-colors">Delete template</Button></div>
        </Card>
        <Card className="bg-zinc-900/45 p-5 ring-1 ring-inset ring-violet-400/5 sm:p-6"><div className="mb-4 flex items-center justify-between"><label className="block text-xs uppercase tracking-widest text-zinc-600 font-mono">Validation rules</label><Button variant="outline" size="xs" onClick={addRule}>+ Add rule</Button></div>{editRules.length === 0 && <p className="text-xs text-zinc-600 font-mono">No rules yet. Add one to start validating products against this template.</p>}<div className="space-y-4">{editRules.map((rule) => <Card key={rule.id} className="border border-zinc-800 bg-zinc-950 p-4 ring-0">
          <div className="mb-3 flex flex-wrap items-center gap-2"><Select value={rule.type} items={RULE_TYPES} onValueChange={(value) => changeRuleType(rule.id, value as TemplateRule['type'])}><SelectTrigger className="w-56"><SelectValue /></SelectTrigger><SelectContent>{RULE_TYPES.map((type) => <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>)}</SelectContent></Select><Select value={rule.required ? 'required' : 'optional'} items={requiredItems} onValueChange={(value) => updateRule(rule.id, { required: value === 'required' })}><SelectTrigger className="w-32"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="required">Required</SelectItem><SelectItem value="optional">Optional</SelectItem></SelectContent></Select><Button variant="outline" size="xs" className="ml-auto" onClick={() => removeRule(rule.id)}>✕ Remove rule</Button></div>
          <Input placeholder="Rule label, e.g. Expression files" value={rule.label} onChange={(event) => updateRule(rule.id, { label: event.target.value })} className="mb-3" />
          {rule.type === 'variant_checklist' && <div className="space-y-2"><Input placeholder="Folder, e.g. Expressions" value={rule.folder} onChange={(event) => updateRule(rule.id, { folder: event.target.value })} /><div className="flex flex-wrap gap-2">{rule.expectedVariants.map((variant) => <Badge key={variant} variant="outline" className="h-auto rounded-none border-zinc-700 bg-zinc-900 px-2 py-0.5 font-normal font-mono text-zinc-300">{variant}<button type="button" onClick={() => removeChip(rule.id, 'expectedVariants', variant)} className="text-zinc-500 hover:text-red-400" aria-label={`Remove ${variant}`}>✕</button></Badge>)}</div><div className="flex gap-2"><Input placeholder="Add expected variant name" value={chipInputs[rule.id] ?? ''} onChange={(event) => setChipInputs((previous) => ({ ...previous, [rule.id]: event.target.value }))} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addChip(rule.id, 'expectedVariants') } }} /><Button type="button" variant="outline" size="xs" onClick={() => addChip(rule.id, 'expectedVariants')}>Add</Button></div></div>}
          {rule.type === 'file_type_present' && <div className="space-y-2"><Input placeholder="Folder (optional — leave blank for anywhere)" value={rule.folder ?? ''} onChange={(event) => updateRule(rule.id, { folder: event.target.value || undefined })} /><div className="flex flex-wrap gap-2">{rule.extensions.map((extension) => <Badge key={extension} variant="outline" className="h-auto rounded-none border-zinc-700 bg-zinc-900 px-2 py-0.5 font-normal font-mono text-zinc-300">{extension}<button type="button" onClick={() => removeChip(rule.id, 'extensions', extension)} className="text-zinc-500 hover:text-red-400" aria-label={`Remove ${extension}`}>✕</button></Badge>)}</div><div className="flex gap-2"><Input placeholder="Add file extension, e.g. pdf" value={chipInputs[rule.id] ?? ''} onChange={(event) => setChipInputs((previous) => ({ ...previous, [rule.id]: event.target.value }))} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addChip(rule.id, 'extensions') } }} /><Button type="button" variant="outline" size="xs" onClick={() => addChip(rule.id, 'extensions')}>Add</Button></div></div>}
          {rule.type === 'field_present' && <Select value={rule.field} items={fieldItems} onValueChange={(value) => updateRule(rule.id, { field: value as FieldPresentRule['field'] })}><SelectTrigger className="w-48"><SelectValue /></SelectTrigger><SelectContent>{FIELD_OPTIONS.map((field) => <SelectItem key={field.value} value={field.value}>{field.label}</SelectItem>)}</SelectContent></Select>}
        </Card>)}</div></Card>
      </div> : <Card className="flex-1 border border-dashed border-zinc-800 ring-0 flex items-center justify-center"><p className="text-zinc-600 font-mono text-sm">No templates yet. Create one to get started.</p></Card>}
    </div>
  </div>
}
