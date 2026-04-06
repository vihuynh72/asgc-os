export async function fetchLatestOwnOpenSession(supabase, userId, selectColumns = "id,checkin_at") {
  return await supabase
    .from("office_hour_sessions")
    .select(selectColumns)
    .eq("user_id", userId)
    .eq("status", "open")
    .is("checkout_at", null)
    .order("checkin_at", { ascending: false })
    .limit(1)
    .maybeSingle();
}
