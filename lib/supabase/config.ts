/** True when the Supabase env vars are present, i.e. the backend is wired up.
 *  Used by the data layer to decide between live queries and mock fallback. */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
