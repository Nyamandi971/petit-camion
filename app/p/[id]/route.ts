import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const orderNumber = Number(id);
  if (!Number.isInteger(orderNumber)) {
    return new Response("Lien invalide", { status: 400 });
  }

  const { data: order } = await supabaseAdmin
    .from("orders")
    .select("stripe_checkout_url")
    .eq("order_number", orderNumber)
    .single();

  if (!order?.stripe_checkout_url) {
    return new Response("Commande introuvable", { status: 404 });
  }

  return Response.redirect(order.stripe_checkout_url, 302);
}