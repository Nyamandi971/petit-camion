import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase";
import { requireApiKey } from "@/lib/auth";

const postSchema = z.object({
  telegram_chat_id: z.number().int(),
  display_name: z.string().optional(),
});

// GET /api/customers?telegram_chat_id=12345 (filtre optionnel)
export async function GET(request: Request) {
  const authError = requireApiKey(request);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const telegramChatId = searchParams.get("telegram_chat_id");

  let query = supabaseAdmin.from("customers").select("*");
  if (telegramChatId) {
    query = query.eq("telegram_chat_id", Number(telegramChatId));
  }

  const { data, error } = await query.order("first_seen_at", { ascending: false });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

// POST /api/customers : crée (ou renvoie si existant) un client par telegram_chat_id
export async function POST(request: Request) {
  const authError = requireApiKey(request);
  if (authError) return authError;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { telegram_chat_id, display_name } = parsed.data;

  // 1. Chercher s'il existe déjà
  const { data: existing, error: findError } = await supabaseAdmin
    .from("customers")
    .select("*")
    .eq("telegram_chat_id", telegram_chat_id)
    .maybeSingle();

  if (findError) {
    return NextResponse.json({ error: findError.message }, { status: 500 });
  }
  if (existing) {
    return NextResponse.json(existing);
  }

  // 2. Sinon, créer
  const { data: created, error: createError } = await supabaseAdmin
    .from("customers")
    .insert({ telegram_chat_id, display_name })
    .select()
    .single();

  if (createError) {
    return NextResponse.json({ error: createError.message }, { status: 500 });
  }
  return NextResponse.json(created, { status: 201 });
}