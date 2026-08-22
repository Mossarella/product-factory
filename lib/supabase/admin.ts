import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

let client: ReturnType<typeof createSupabaseClient<Database>> | null = null

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) throw new Error('Supabase service-role configuration is missing')
  if (!client) {
    client = createSupabaseClient<Database>(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  }
  return client
}
