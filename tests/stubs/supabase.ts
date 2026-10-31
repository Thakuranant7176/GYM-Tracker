// Stand-in for src/supabase.ts in the render tests: that module reads Vite's import.meta.env and
// creates a real client. The render tests never talk to a database.
export const isSupabaseConfigured = true
export const supabase = null
