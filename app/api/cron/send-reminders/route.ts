import { NextResponse } from "next/server";
import { fromZonedTime } from "date-fns-tz";
import { supabaseAdmin } from "@/lib/supabase";
import { weekdayOf } from "@/lib/availability";
import { sendTelegramMessage } from "@/lib/telegram";

const TZ = "America/Guadeloupe";

type OrderRow = {
  id: string;
  pickup_date: string;
  pickup_slot: string;
  customers: { telegram_chat_id: number | string; display_name: string | null } | null;
};

type LocationRow = { name: string; address: string };

function pickupUtc(date: string, slot: string): Date {
  return fromZonedTime(`${date}T${slot}:00`, TZ);
}

async function fetchLocation(weekday: number): Promise<LocationRow | null> {
  const { data, error } = await supabaseAdmin
    .from("locations")
    .select("name, address")
    .eq("weekday", weekday)
    .single();
  if (error || !data) return null;
  return data as LocationRow;
}


export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const windowStart = new Date(now.getTime() + 10 * 60 * 1000);
  const windowEnd = new Date(now.getTime() + 15 * 60 * 1000);

  const { data: orders, error: fetchError } = await supabaseAdmin
    .from("orders")
    .select("id, pickup_date, pickup_slot, customers(telegram_chat_id, display_name)")
    .neq("status", "cancelled")
    .is("reminded_at", null);

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  const candidates = (orders as unknown as OrderRow[]).filter((o) => {
    const t = pickupUtc(o.pickup_date, o.pickup_slot);
    return t >= windowStart && t <= windowEnd;
  });

  const locationCache = new Map<number, LocationRow | null>();
  const results: { id: string; ok: boolean; error?: string }[] = [];

  for (const order of candidates) {
    const chatId = String(order.customers?.telegram_chat_id ?? "");
    if (!chatId || chatId === "null") {
      results.push({ id: order.id, ok: false, error: "no telegram_chat_id" });
      continue;
    }

    const weekday = weekdayOf(order.pickup_date);
    if (!locationCache.has(weekday)) {
      locationCache.set(weekday, await fetchLocation(weekday));
    }
    const loc = locationCache.get(weekday) ?? null;

    const name = order.customers?.display_name ?? "cher client";
    const locLine = loc ? `\n📍 ${loc.name}\n🗺 ${loc.address}` : "";
    const message =
      `🚚 <b>Rappel – Petit Camion</b>\n\n` +
      `Bonjour ${name} ! Votre commande arrive dans environ 10 min.${locLine}\n🕛 Retrait à ${order.pickup_slot}\n\nMerci et bon appétit !`;

    try {
      await sendTelegramMessage(chatId, message);

      const { error: updateError } = await supabaseAdmin
        .from("orders")
        .update({ reminded_at: new Date().toISOString() })
        .eq("id", order.id);

      if (updateError) throw new Error(updateError.message);

      results.push({ id: order.id, ok: true });
    } catch (err) {
      results.push({ id: order.id, ok: false, error: (err as Error).message });
    }
  }

  return NextResponse.json({ processed: results.length, results });
}
