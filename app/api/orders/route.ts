import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase";
import { requireApiKey } from "@/lib/auth";
import { checkPickupAvailability } from "@/lib/availability";

const orderSchema = z.object({
  customer_id: z.string().uuid(),
  pickup_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  pickup_slot: z.enum(["12:00", "12:15", "12:30", "12:45", "13:00", "13:15", "13:30", "13:45"]),
  items: z
    .array(
      z.object({
        menu_item_id: z.string().uuid(),
        qty: z.number().int().min(1),
      })
    )
    .min(1),
});

export async function POST(request: Request) {
  const authError = requireApiKey(request);
  if (authError) return authError;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = orderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { customer_id, pickup_date, pickup_slot, items } = parsed.data;

  let availability;
  try {
    availability = await checkPickupAvailability(pickup_date, items);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }

  if (!availability.valid) {
    return NextResponse.json(
      { error: availability.message, code: availability.code, suggested_date: availability.suggested_date },
      { status: 409 }
    );
  }

  const priceMap = new Map(availability.menuItems.map((m) => [m.id, m.price_cents]));
  const total_cents = items.reduce((sum, it) => {
    const price = priceMap.get(it.menu_item_id) ?? 0;
    return sum + price * it.qty;
  }, 0);

  const { data: order, error: insertError } = await supabaseAdmin
    .from("orders")
    .insert({ customer_id, pickup_date, pickup_slot, items, total_cents, status: "pending" })
    .select()
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json(order, { status: 201 });
}
