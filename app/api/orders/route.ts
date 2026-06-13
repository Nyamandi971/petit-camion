import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase";
import { requireApiKey } from "@/lib/auth";
import { checkPickupAvailability, weekdayOf } from "@/lib/availability";
import { sendTelegramMessage } from "@/lib/telegram";
import { stripe } from "@/lib/stripe";

export const runtime = "nodejs";

const BOT_URL = "https://t.me/Petitcamion_gpe_bot";

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

async function sendConfirmation(
  customerId: string,
  order: { id: string; pickup_date: string; pickup_slot: string; total_cents: number },
  items: { menu_item_id: string; qty: number }[],
  menuItems: { id: string; name: string }[]
): Promise<void> {
  const { data: customer } = await supabaseAdmin
    .from("customers")
    .select("telegram_chat_id, display_name")
    .eq("id", customerId)
    .single();

  if (!customer?.telegram_chat_id) return;

  const { data: location } = await supabaseAdmin
    .from("locations")
    .select("name, address")
    .eq("weekday", weekdayOf(order.pickup_date))
    .single();

  const nameMap = new Map(menuItems.map((m) => [m.id, m.name]));
  const itemLines = items
    .map((it) => `– ${nameMap.get(it.menu_item_id) ?? it.menu_item_id} ×${it.qty}`)
    .join("\n");

  const euros = (order.total_cents / 100).toFixed(2).replace(".", ",");
  const locLine = location ? `\n📍 ${location.name}\n🗺 ${location.address}` : "";
  const greeting = customer.display_name ? `Bonjour ${customer.display_name} !` : "Bonjour !";

  const message =
    `✅ <b>Commande confirmée – Petit Camion</b>\n\n` +
    `${greeting} Votre commande a bien été enregistrée.\n\n` +
    `🛍 <b>Votre commande :</b>\n${itemLines}\n\n` +
    `💰 Total : ${euros} €${locLine}\n` +
    `🕛 Retrait le ${order.pickup_date} à ${order.pickup_slot}\n\n` +
    `À tout à l'heure !`;

  await sendTelegramMessage(String(customer.telegram_chat_id), message);
}

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
  const nameMap = new Map(availability.menuItems.map((m) => [m.id, m.name]));
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

  // Session de paiement Stripe
  let payment_url: string | null = null;
  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: items.map((it) => ({
        quantity: it.qty,
        price_data: {
          currency: "eur",
          unit_amount: priceMap.get(it.menu_item_id) ?? 0,
          product_data: { name: nameMap.get(it.menu_item_id) ?? "Plat" },
        },
      })),
      success_url: BOT_URL,
      cancel_url: BOT_URL,
      metadata: { order_id: order.id },
    });
    payment_url = session.url;
  } catch (err) {
    return NextResponse.json({ error: "Stripe: " + (err as Error).message }, { status: 500 });
  }

  // Fire-and-forget (sera déplacé vers le webhook à l'étape 4)
  sendConfirmation(customer_id, order, items, availability.menuItems).catch(() => {});

  return NextResponse.json({ ...order, payment_url }, { status: 201 });
}