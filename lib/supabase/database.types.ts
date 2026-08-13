export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: { PostgrestVersion: "14.15" }
  public: {
    Tables: {
      fixed_asset_files: {
        Row: { asset_key: string; created_at: string; filename: string; id: string; original_name: string; owner_id: string; product_id: string; storage_path: string | null }
        Insert: { asset_key: string; created_at?: string; filename: string; id?: string; original_name: string; owner_id: string; product_id: string; storage_path?: string | null }
        Update: { asset_key?: string; created_at?: string; filename?: string; id?: string; original_name?: string; owner_id?: string; product_id?: string; storage_path?: string | null }
        Relationships: []
      }
      product_builds: {
        Row: { changelog: string; created_at: string; file_size: number; filename: string; id: string; manifest: Json; owner_id: string; product_id: string; reverted_from: number | null; storage_path: string | null; version: number }
        Insert: { changelog?: string; created_at?: string; file_size?: number; filename: string; id?: string; manifest?: Json; owner_id: string; product_id: string; reverted_from?: number | null; storage_path?: string | null; version: number }
        Update: { changelog?: string; created_at?: string; file_size?: number; filename?: string; id?: string; manifest?: Json; owner_id?: string; product_id?: string; reverted_from?: number | null; storage_path?: string | null; version?: number }
        Relationships: []
      }
      product_files: {
        Row: { created_at: string; filename: string; folder: string; id: string; original_name: string; owner_id: string; product_id: string; storage_path: string | null; variant: string }
        Insert: { created_at?: string; filename: string; folder?: string; id?: string; original_name: string; owner_id: string; product_id: string; storage_path?: string | null; variant?: string }
        Update: { created_at?: string; filename?: string; folder?: string; id?: string; original_name?: string; owner_id?: string; product_id?: string; storage_path?: string | null; variant?: string }
        Relationships: []
      }
      product_events: {
        Row: { created_at: string; event_type: string; id: string; metadata: Json; owner_id: string; product_id: string | null }
        Insert: { created_at?: string; event_type: string; id?: string; metadata?: Json; owner_id: string; product_id?: string | null }
        Update: { created_at?: string; event_type?: string; id?: string; metadata?: Json; owner_id?: string; product_id?: string | null }
        Relationships: []
      }
      product_releases: {
        Row: { bundle_filename: string; bundle_sha256: string; bundle_size: number; bundle_storage_path: string; build_id: string; created_at: string; id: string; listing_snapshot: Json; owner_id: string; product_id: string; release_summary: Json; version: number }
        Insert: { bundle_filename: string; bundle_sha256: string; bundle_size: number; bundle_storage_path: string; build_id: string; created_at?: string; id?: string; listing_snapshot?: Json; owner_id: string; product_id: string; release_summary?: Json; version: number }
        Update: { bundle_filename?: string; bundle_sha256?: string; bundle_size?: number; bundle_storage_path?: string; build_id?: string; created_at?: string; id?: string; listing_snapshot?: Json; owner_id?: string; product_id?: string; release_summary?: Json; version?: number }
        Relationships: []
      }
      product_templates: {
        Row: { assets: string[]; created_at: string; id: string; name: string; owner_id: string; rules: Json; updated_at: string }
        Insert: { assets?: string[]; created_at?: string; id?: string; name: string; owner_id: string; rules?: Json; updated_at?: string }
        Update: { assets?: string[]; created_at?: string; id?: string; name?: string; owner_id?: string; rules?: Json; updated_at?: string }
        Relationships: []
      }
      products: {
        Row: { build_version: number; commercial_price: number | null; complete: boolean; contact: string; created_at: string; currency: string; description: string; etsy_tags: string[]; etsy_title: string; folders: string[]; id: string; license_type: string; name: string; notes: string; owner_id: string; price: number; product_name: string; sku: string; template_id: string | null; updated_at: string }
        Insert: { build_version?: number; commercial_price?: number | null; complete?: boolean; contact?: string; created_at?: string; currency?: string; description?: string; etsy_tags?: string[]; etsy_title?: string; folders?: string[]; id?: string; license_type?: string; name: string; notes?: string; owner_id: string; price?: number; product_name?: string; sku?: string; template_id?: string | null; updated_at?: string }
        Update: { build_version?: number; commercial_price?: number | null; complete?: boolean; contact?: string; created_at?: string; currency?: string; description?: string; etsy_tags?: string[]; etsy_title?: string; folders?: string[]; id?: string; license_type?: string; name?: string; notes?: string; owner_id?: string; price?: number; product_name?: string; sku?: string; template_id?: string | null; updated_at?: string }
        Relationships: []
      }
      asset_loadouts: {
        Row: { asset_keys: string[]; created_at: string; id: string; name: string; owner_id: string; updated_at: string }
        Insert: { asset_keys?: string[]; created_at?: string; id?: string; name: string; owner_id: string; updated_at?: string }
        Update: { asset_keys?: string[]; created_at?: string; id?: string; name?: string; owner_id?: string; updated_at?: string }
        Relationships: []
      }
      license_keys: {
        Row: { id: string; issued_at: string; key: string; plan: string; used_at: string | null; used_by_user_id: string | null }
        Insert: { id?: string; issued_at?: string; key: string; plan?: string; used_at?: string | null; used_by_user_id?: string | null }
        Update: { id?: string; issued_at?: string; key?: string; plan?: string; used_at?: string | null; used_by_user_id?: string | null }
        Relationships: []
      }
      profiles: {
        Row: { created_at: string; display_name: string | null; id: string; license_activated_at: string | null; plan: string; readme_footer: string | null; shop_contact: string | null; shop_description: string | null; shop_name: string | null; stripe_customer_id: string | null; stripe_subscription_id: string | null; subscription_status: string | null; updated_at: string }
        Insert: { created_at?: string; display_name?: string | null; id: string; license_activated_at?: string | null; plan?: string; readme_footer?: string | null; shop_contact?: string | null; shop_description?: string | null; shop_name?: string | null; stripe_customer_id?: string | null; stripe_subscription_id?: string | null; subscription_status?: string | null; updated_at?: string }
        Update: { created_at?: string; display_name?: string | null; id?: string; license_activated_at?: string | null; plan?: string; readme_footer?: string | null; shop_contact?: string | null; shop_description?: string | null; shop_name?: string | null; stripe_customer_id?: string | null; stripe_subscription_id?: string | null; subscription_status?: string | null; updated_at?: string }
        Relationships: []
      }
    }
    Views: { [_ in never]: never }
    Functions: {
      get_my_license: { Args: Record<PropertyKey, never>; Returns: { activated_at: string | null; plan: string; subscription_status: string | null }[] }
      redeem_license_key: { Args: { p_key: string }; Returns: { activated_at: string; plan: string }[] }
    }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}
