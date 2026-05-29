import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireApiKey } from "@/lib/auth";

export async function GET(request: Request) {
  const authError = requireApiKey(request);
  if (authError) return authError;

  const { data, error } = await supabaseAdmin
    .from("menu_items")
    .select("id, name, description, price_cents, daily_quota, active")
    .eq("active", true)
    .order("name");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}