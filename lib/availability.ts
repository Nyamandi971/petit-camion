import { supabaseAdmin } from "@/lib/supabase";
import { formatInTimeZone } from "date-fns-tz";
import { parseISO } from "date-fns";

const TZ = "America/Guadeloupe";
const CUTOFF_HOUR = 11;

export function weekdayOf(dateStr: string): number {
  return parseISO(dateStr + "T12:00:00Z").getUTCDay();
}

export function todayInGP(): string {
  return formatInTimeZone(new Date(), TZ, "yyyy-MM-dd");
}

export function currentHourInGP(): number {
  return Number(formatInTimeZone(new Date(), TZ, "H"));
}

export function addDaysISO(dateStr: string, n: number): string {
  const d = parseISO(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return formatInTimeZone(d, "UTC", "yyyy-MM-dd");
}

export function nextOpenDay(dateStr: string): string {
  let d = dateStr;
  while (weekdayOf(d) === 0) {
    d = addDaysISO(d, 1);
  }
  return d;
}

export type MenuItem = {
  id: string;
  name: string;
  price_cents: number;
  daily_quota: number;
};

type Failure = {
  valid: false;
  code: string;
  message: string;
  suggested_date: string;
  stock_remaining?: Record<string, number>;
};

type Success = {
  valid: true;
  menuItems: MenuItem[];
  stock_remaining: Record<string, number>;
};

export type AvailabilityResult = Failure | Success;

export async function checkPickupAvailability(
  dateParam: string,
  requestedItems: { menu_item_id: string; qty: number }[]
): Promise<AvailabilityResult> {
  const today = todayInGP();
  const hourNow = currentHourInGP();

  if (dateParam < today) {
    const base = hourNow >= CUTOFF_HOUR ? addDaysISO(today, 1) : today;
    return {
      valid: false,
      code: "past_date",
      message: "Cette date est déjà passée.",
      suggested_date: nextOpenDay(base),
    };
  }

  if (weekdayOf(dateParam) === 0) {
    return {
      valid: false,
      code: "closed_sunday",
      message: "Le food truck est fermé le dimanche.",
      suggested_date: nextOpenDay(addDaysISO(dateParam, 1)),
    };
  }

  if (dateParam === today && hourNow >= CUTOFF_HOUR) {
    return {
      valid: false,
      code: "past_cutoff",
      message: "Trop tard pour aujourd'hui (commandes acceptées jusqu'à 11h).",
      suggested_date: nextOpenDay(addDaysISO(today, 1)),
    };
  }

  const { data: location, error: locError } = await supabaseAdmin
    .from("locations")
    .select("open")
    .eq("weekday", weekdayOf(dateParam))
    .single();

  if (locError) {
    throw new Error(locError.message);
  }
  if (!location.open) {
    return {
      valid: false,
      code: "closed_day",
      message: "Le food truck est exceptionnellement fermé ce jour-là.",
      suggested_date: nextOpenDay(addDaysISO(dateParam, 1)),
    };
  }

  const { data: menuItems, error: menuError } = await supabaseAdmin
    .from("menu_items")
    .select("id, name, price_cents, daily_quota")
    .eq("active", true);
  if (menuError) {
    throw new Error(menuError.message);
  }

  const { data: ordersOfDay, error: ordersError } = await supabaseAdmin
    .from("orders")
    .select("items, status")
    .eq("pickup_date", dateParam)
    .neq("status", "cancelled");
  if (ordersError) {
    throw new Error(ordersError.message);
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

  for (const req of requestedItems) {
    const remaining = stock_remaining[req.menu_item_id] ?? 0;
    if (req.qty > remaining) {
      const itemName = menuItems.find((m) => m.id === req.menu_item_id)?.name || "ce plat";
      return {
        valid: false,
        code: "out_of_stock",
        message: `Plus assez de stock pour ${itemName} (reste ${remaining}, demandé ${req.qty}).`,
        suggested_date: nextOpenDay(addDaysISO(dateParam, 1)),
        stock_remaining,
      };
    }
  }

  return { valid: true, menuItems, stock_remaining };
}
