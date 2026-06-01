import { NextResponse } from "next/server";
import { requireApiKey } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import {
  checkPickupAvailability,
  weekdayOf,
} from "@/lib/availability";

const SLOTS = ["12:00", "12:15", "12:30", "12:45", "13:00", "13:15", "13:30", "13:45"];
const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

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

  const requestedItems = parseItems(itemsParam);

  let result;
  try {
    result = await checkPickupAvailability(dateParam, requestedItems);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }

  if (!result.valid) {
    return NextResponse.json(result);
  }

  const { data: location, error: locError } = await supabaseAdmin
    .from("locations")
    .select("name, address, gmap_url")
    .eq("weekday", weekdayOf(dateParam))
    .single();

  if (locError) {
    return NextResponse.json({ error: locError.message }, { status: 500 });
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
    stock_remaining: result.stock_remaining,
  });
}
