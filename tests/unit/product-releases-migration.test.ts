import { describe, expect, it } from 'bun:test'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const migrationPath = path.join(process.cwd(), 'supabase/migrations/0007_product_releases.sql')

describe('product_releases migration', () => {
  it('defines immutable release identity and artifact integrity constraints', async () => {
    const sql = await readFile(migrationPath, 'utf8')

    expect(sql).toContain('create table if not exists public.product_releases')
    expect(sql).toContain('build_id uuid not null references public.product_builds(id) on delete restrict')
    expect(sql).toContain("constraint product_releases_owner_product_build_key unique (owner_id, product_id, build_id)")
    expect(sql).toContain("constraint product_releases_owner_product_version_key unique (owner_id, product_id, version)")
    expect(sql).toContain("bundle_sha256 text not null check (bundle_sha256 ~ '^[0-9a-f]{64}$')")
  })

  it('exposes only owner-scoped authenticated select and insert policies', async () => {
    const sql = await readFile(migrationPath, 'utf8')

    expect(sql).toContain('alter table public.product_releases enable row level security')
    expect(sql).toContain('for select to authenticated')
    expect(sql).toContain('for insert to authenticated')
    expect(sql).toContain('using (auth.uid() = owner_id)')
    expect(sql).toContain('with check (auth.uid() = owner_id)')
    expect(sql).not.toContain('for update to authenticated')
    expect(sql).not.toContain('for delete to authenticated')
  })
})
