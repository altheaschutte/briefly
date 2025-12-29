import type { SupabaseClient } from "@supabase/supabase-js";

export type Profile = {
  id: string;
  first_name: string;
  intention: string;
  user_about_context: string | null;
  timezone: string | null;
};

export async function getProfile(client: SupabaseClient, userId: string): Promise<Profile | null> {
  const { data, error } = await client
    .from("profiles")
    .select("id, first_name, intention, user_about_context, timezone")
    .eq("id", userId)
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    throw error;
  }

  return data ?? null;
}

export async function upsertProfile(
  client: SupabaseClient,
  profile: { id: string; first_name: string; intention: string; user_about_context: string; timezone?: string | null }
): Promise<void> {
  const { error } = await client.from("profiles").upsert(profile, { onConflict: "id" });
  if (error) {
    throw error;
  }
}
