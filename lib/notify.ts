import { supabaseAdmin } from "@/lib/supabase";
import { sendTelegramMessage } from "@/lib/telegram";
import { weekdayOf } from "@/lib/availability";

type OrderItem = { menu_item_id: string; qty: number };

export async function sendOrderConfirmation(orderId: string): Promise<void> {
  const { data: order } = await supabaseAdmin
    .from("orders")
    .select("id, order_number, pickup_date, pickup_slot, total_cents, items, customer_id")
    .eq("id", orderId)
    .single();
  if (!order) return;

  const { data: customer } = await supabaseAdmin
    .from("customers")
    .select("telegram_chat_id, display_name")
    .eq("id", order.customer_id)
    .single();
  if (!customer?.telegram_chat_id) return;

  const { data: location } = await supabaseAdmin
    .from("locations")
    .select("name, address")
    .eq("weekday", weekdayOf(order.pickup_date))
    .single();

  const items = (order.items as OrderItem[]) ?? [];
  const ids = items.map((it) => it.menu_item_id);
  let menu: { id: string; name: string }[] = [];
  if (ids.length) {
    const r = await supabaseAdmin.from("menu_items").select("id, name").in("id", ids);
    menu = r.data ?? [];
  }
  const nameMap = new Map(menu.map((m) => [m.id, m.name]));

  const itemLines = items
    .map((it) => `– ${nameMap.get(it.menu_item_id) ?? it.menu_item_id} ×${it.qty}`)
    .join("\n");

  const euros = (order.total_cents / 100).toFixed(2).replace(".", ",");
  const locLine = location ? `\n📍 ${location.name}\n🗺 ${location.address}` : "";
  const greeting = customer.display_name ? `Bonjour ${customer.display_name} !` : "Bonjour !";
  const num = order.order_number ? ` #${order.order_number}` : "";
  const slot = String(order.pickup_slot).slice(0, 5);

  const message =
    `✅ <b>Paiement reçu – Petit Camion</b>\n\n` +
    `${greeting} Ta commande${num} est confirmée et payée.\n\n` +
    `🛍 <b>Ta commande :</b>\n${itemLines}\n\n` +
    `💰 Total : ${euros} €${locLine}\n` +
    `🕛 Retrait le ${order.pickup_date} à ${slot}\n\n` +
    `Un rappel partira 15 min avant. À tout à l'heure !`;

  await sendTelegramMessage(String(customer.telegram_chat_id), message);
}