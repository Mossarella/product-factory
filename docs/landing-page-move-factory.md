# Spec: Move Factory to /app + Create /app route

## Overview
Move the existing factory UI from `/` to `/app` route so the landing page can live at `/`.

## Task 1: Create app/app/layout.tsx

Create `/Users/Noppheera.Bha/Desktop/Work/product-factory/app/app/layout.tsx`:

```tsx
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Product Factory — MossarellaStudio',
  description: 'Pack your digital products. List on Etsy.',
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
```

## Task 2: Create app/app/page.tsx

Copy the ENTIRE content of `/Users/Noppheera.Bha/Desktop/Work/product-factory/app/page.tsx` to `/Users/Noppheera.Bha/Desktop/Work/product-factory/app/app/page.tsx` verbatim.
Do NOT modify the content — copy it exactly as-is.

## Verification
- `app/app/page.tsx` exists and has the full factory UI component
- `app/app/layout.tsx` exists with the metadata export
- Print: === COMPLETE: factory moved to /app ===
