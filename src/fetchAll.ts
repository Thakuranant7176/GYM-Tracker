import { supabase } from './supabase'

type FetchError = { message: string; code?: string | null }

/**
 * Reads every row the signed-in user can see in `table`, page by page.
 * PostgREST returns at most 1,000 rows per request, so a single `select('*')` silently
 * truncates a long history. Row Level Security still applies: only this user's rows come back.
 * Pages are ordered by a stable column so no row is skipped or repeated between pages.
 */
export async function fetchAllRows<T>(table: string, orderColumn = 'id', pageSize = 1000, maxPages = 200): Promise<{ data: T[] | null; error: FetchError | null }> {
  const rows: T[] = []
  for (let page = 0; page < maxPages; page += 1) {
    const from = page * pageSize
    const { data, error } = await supabase!.from(table).select('*').order(orderColumn).range(from, from + pageSize - 1)
    if (error) return { data: null, error }
    rows.push(...((data ?? []) as T[]))
    if (!data || data.length < pageSize) return { data: rows, error: null }
  }
  return { data: null, error: { message: `Too many rows in ${table} to load at once` } }
}
