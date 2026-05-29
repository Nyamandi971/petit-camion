import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireApiKey } from "@/lib/auth";
import { formatInTimeZone } from "date-fns-tz";
import { parseISO } from "date-fns";

const TZ = "America/Guadeloupe";
const CUTOFF_HOUR = 11;
const SLOTS = ["12:00", "12:15", "12:30", "12:45", "13:00", "13:15", "13:30", "13:45"];
const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

function weekdayOf(dateStr: string): number {
  return parseISO(dateStr + "T12:00:00Z").getUTCDay();
}

function todayInGP(): string {
  return formatInTimeZone(new Date(), TZ, "yyyy-MM-dd");
}

function currentHourInGP(): number {
  return Number(formatInTimeZone(new Date(), TZ, "H"));
}

function addDaysISO(dateStr: string, n: number): string {
  const d = parseISO(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return formatInTimeZone(d, "UTC", "yyyy-MM-dd");
}

function nextOpenDay(dateStr: string): string {
  let d = dateStr;
  while (weekdayOf(d) === 0) {
    d = addDaysISO(d, 1);
  }
  return d;
}

function parseItems(raw: string | null): { menu_item_id: string; qty: number }[] {
  if (!raw) return [];
  return raw
    .split(",")
    .filter(Boolean)
    .map((part) => {
      const [id, qtyStr] = part.split(":");
      return { menu_item_id: id, qty: Number(qtyStr) };
    });
}

export async function GET(request: Request) {
  const authError = requireApiKey(request);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const dateParam = searchParams.get("date");
  const itemsParam = searchParams.get("items");

  if (!dateParam || !dateRegex.test(dateParam)) {
    return NextResponse.json(
      { error: "Missing or invalid 'date' param (expected YYYY-MM-DD)" },
      { status: 400 }
    );
  }

  const today = todayInGP();
  const hourNow = currentHourInGP();

  // Règle 1 : date passée
  if (dateParam < today) {
    const base = hourNow >= CUTOFF_HOUR ? addDaysISO(today, 1) : today;
    return NextResponse.json({
      valid: false,
      code: "past_date",
      message: "Cette date est déjà passée.",
      suggested_date: nextOpenDay(base),
    });
  }

  // Règle 2 : dimanche fermé
  if (weekdayOf(dateParam) === 0) {
    return NextResponse.json({
      valid: false,
      code: "closed_sunday",
      message: "Le food truck est fermé le dimanche.",
      suggested_date: nextOpenDay(addDaysISO(dateParam, 1)),
    });
  }

  // Règle 3 : cutoff 11h pour le jour même
  if (dateParam === today && hourNow >= CUTOFF_HOUR) {
    return NextResponse.json({
      valid: false,
      code: "past_cutoff",
      message: "Trop tard pour aujourd'hui (commandes acceptées jusqu'à 11h).",
      suggested_date: nextOpenDay(addDaysISO(today, 1)),
    });
  }

  // Emplacement du jour
  const { data: location, error: locError } = await supabaseAdmin
    .from("locations")
    .select("name, address, gmap_url, open")
    .eq("weekday", weekdayOf(dateParam))
    .single();

  if (locError) {
    return NextResponse.json({ error: locError.message }, { status: 500 });
  }
  if (!location.open) {
    return NextResponse.json({
      valid: false,
      code: "closed_day",
      message: "Le food truck est exceptionnellement fermé ce jour-là.",
      suggested_date: nextOpenDay(addDaysISO(dateParam, 1)),
    });
  }

  // Stock restant
  const { data: menuItems, error: menuError } = await supabaseAdmin
    .from("menu_items")
    .select("id, name, daily_quota")
    .eq("active", true);
  if (menuError) {
    return NextResponse.json({ error: menuError.message }, { status: 500 });
  }

  const { data: ordersOfDay, error: ordersError } = await supabaseAdmin
    .from("orders")
    .select("items, status")
    .eq("pickup_date", dateParam)
    .neq("status", "cancelled");
  if (ordersError) {
    return NextResponse.json({ error: ordersError.message }, { status: 500 });
  }

  const consumed: Record<string, number> = {};
  for (const order of ordersOfDay || []) {
    const items = (order.items as { menu_item_id: string; qty: number }[]) || [];
    for (const it of items) {
      consumed[it.menu_item_id] = (consumed[it.menu_item_id] || 0) + it.qty;
    }
  }

  const stock_remaining: Record<string, number> = {};
  for (const m of menuItems) {
    stock_remaining[m.id] = Math.max(0, m.daily_quota - (consumed[m.id] || 0));
  }

  // Vérification stock si items demandés
  const requestedItems = parseItems(itemsParam);
  for (const req of requestedItems) {
    const remaining = stock_remaining[req.menu_item_id] ?? 0;
    if (req.qty > remaining) {
      const itemName = menuItems.find((m) => m.id === req.menu_item_id)?.name || "ce plat";
      return NextResponse.json({
        valid: false,
        code: "out_of_stock",
        message: `Plus assez de stock pour ${itemName} (reste ${remaining}, demandé ${req.qty}).`,
        suggested_date: nextOpenDay(addDaysISO(dateParam, 1)),
        stock_remaining,
      });
    }
  }

  return NextResponse.json({
    valid: true,
    date: dateParam,
    weekday: weekdayOf(dateParam),
    location: {
      name: location.name,
      address: location.address,
      gmap_url: location.gmap_url,
    },
    slots: SLOTS,
    stock_remaining,
  });
}