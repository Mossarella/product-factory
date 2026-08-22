export type ProductPlaceholder = {
  key: string
  category: string
  glyph: string
  accent: string
  panel: string
  art: string
  price: string
}

const PLACEHOLDERS: ProductPlaceholder[] = [
  { key: 'wall-art', category: 'WALL ART', glyph: '▧', price: '8.00', accent: 'border-amber-300/70', panel: 'from-amber-950 via-orange-900 to-stone-950', art: 'bg-[radial-gradient(circle_at_26%_28%,rgba(251,191,36,.95)_0_7%,transparent_8%),radial-gradient(circle_at_70%_68%,rgba(245,158,11,.72)_0_18%,transparent_19%),linear-gradient(135deg,#451a03,#a16207_48%,#1c1917)]' },
  { key: 'coloring-book', category: 'COLORING BOOK', glyph: '✺', price: '6.50', accent: 'border-fuchsia-300/70', panel: 'from-fuchsia-950 via-purple-900 to-zinc-950', art: 'bg-[radial-gradient(circle_at_48%_40%,rgba(244,114,182,.85)_0_11%,transparent_12%),radial-gradient(circle_at_72%_66%,rgba(192,132,252,.75)_0_17%,transparent_18%),linear-gradient(135deg,#4a044e,#86198f_52%,#18181b)]' },
  { key: 'planner', category: 'PLANNER', glyph: '▤', price: '7.00', accent: 'border-cyan-300/70', panel: 'from-cyan-950 via-sky-900 to-slate-950', art: 'bg-[linear-gradient(135deg,transparent_0_44%,rgba(103,232,249,.42)_45%_49%,transparent_50%),linear-gradient(30deg,rgba(14,116,144,.82)_0_12%,transparent_13%),linear-gradient(160deg,#083344,#155e75_54%,#0f172a)]' },
  { key: 'wedding', category: 'WEDDING SUITE', glyph: '◇', price: '12.00', accent: 'border-rose-300/70', panel: 'from-rose-950 via-red-900 to-stone-950', art: 'bg-[radial-gradient(ellipse_at_50%_32%,rgba(254,205,211,.8)_0_13%,transparent_14%),radial-gradient(ellipse_at_25%_70%,rgba(251,113,133,.65)_0_15%,transparent_16%),linear-gradient(135deg,#4c0519,#9f1239_52%,#1c1917)]' },
  { key: 'social', category: 'SOCIAL KIT', glyph: '◈', price: '15.00', accent: 'border-lime-300/70', panel: 'from-lime-950 via-emerald-900 to-zinc-950', art: 'bg-[linear-gradient(45deg,rgba(163,230,53,.72)_0_18%,transparent_19%_48%,rgba(34,197,94,.58)_49%_70%,transparent_71%),linear-gradient(145deg,#1a2e05,#166534_55%,#18181b)]' },
  { key: 'clipart', category: 'CLIPART BUNDLE', glyph: '✿', price: '9.00', accent: 'border-violet-300/70', panel: 'from-violet-950 via-indigo-900 to-slate-950', art: 'bg-[radial-gradient(circle_at_30%_35%,rgba(167,139,250,.9)_0_9%,transparent_10%),radial-gradient(circle_at_68%_62%,rgba(129,140,248,.76)_0_15%,transparent_16%),linear-gradient(135deg,#2e1065,#3730a3_52%,#0f172a)]' },
]

export function productPlaceholder(name: string): ProductPlaceholder {
  const normalized = name.toLowerCase()
  const index = PLACEHOLDERS.findIndex((placeholder) =>
    normalized.includes(placeholder.key.split('-')[0]),
  )
  return PLACEHOLDERS[index >= 0 ? index : 0]
}

export function allProductPlaceholders() {
  return [...PLACEHOLDERS]
}
