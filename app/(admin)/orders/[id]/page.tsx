import { supabaseAdmin } from "@/lib/supabase";
import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";

type Order = {
  id: string;
  pickup_date: string;
  pickup_slot: string;
  total_cents: number;
  status: string;
  reminded_at: string | null;
  created_at: string;
  items: { menu_item_id: string; qty: number }[];
  customers: { display_name: string | null; telegram_chat_id: number | string } | null;
};

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { data: order } = await supabaseAdmin
    .from("orders")
    .select("*, customers(display_name, telegram_chat_id)")
    .eq("id", id)
    .single();

  if (!order) notFound();

  const o = order as unknown as Order;

  const { data: menuItems } = await supabaseAdmin
    .from("menu_items")
    .select("id, name, price_cents");

  const nameMap = new Map((menuItems ?? []).map((m) => [m.id, { name: m.name, price: m.price_cents }]));

  async function markPickedUp() {
    "use server";
    await supabaseAdmin.from("orders").update({ status: "picked_up" }).eq("id", id);
    revalidatePath(`/orders/${id}`);
    revalidatePath("/orders");
    revalidatePath("/");
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/orders" className="text-sm text-zinc-500 hover:text-zinc-900">
          ← Retour
        </Link>
        <h1 className="text-2xl font-semibold">Commande #{o.id.slice(0, 8)}</h1>
        <StatusBadge status={o.status} />
      </div>

      <div className="bg-white rounded-xl border border-zinc-200 divide-y">
        <Section label="Client">
          {o.customers?.display_name ?? <span className="text-zinc-400">Anonyme</span>}
          {o.customers?.telegram_chat_id && (
            <span className="ml-2 text-xs text-zinc-400">
              (chat id : {String(o.customers.telegram_chat_id)})
            </span>
          )}
        </Section>

        <Section label="Retrait">
          {o.pickup_date} à {o.pickup_slot}
        </Section>

        <Section label="Articles">
          <ul className="space-y-1">
            {o.items.map((it, i) => {
              const item = nameMap.get(it.menu_item_id);
              const lineTotal = (item?.price ?? 0) * it.qty;
              return (
                <li key={i} className="flex justify-between text-sm">
                  <span>
                    {item?.name ?? it.menu_item_id} <span className="text-zinc-400">×{it.qty}</span>
                  </span>
                  <span className="tabular-nums text-zinc-600">
                    {(lineTotal / 100).toFixed(2).replace(".", ",")} €
                  </span>
                </li>
              );
            })}
          </ul>
        </Section>

        <Section label="Total">
          <span className="text-lg font-semibold tabular-nums">
            {(o.total_cents / 100).toFixed(2).replace(".", ",")} €
          </span>
        </Section>

        <Section label="Passée le">
          {new Date(o.created_at).toLocaleString("fr-FR", { timeZone: "America/Guadeloupe" })}
        </Section>

        {o.reminded_at && (
          <Section label="Rappel envoyé">
            {new Date(o.reminded_at).toLocaleString("fr-FR", { timeZone: "America/Guadeloupe" })}
          </Section>
        )}
      </div>

      {o.status === "pending" && (
        <form action={markPickedUp}>
          <Button type="submit" className="w-full">
            Marquer comme retirée
          </Button>
        </form>
      )}
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-5 py-4 flex gap-4">
      <span className="w-32 text-sm font-medium text-zinc-500 shrink-0">{label}</span>
      <span className="text-sm">{children}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    pending: "secondary",
    picked_up: "default",
    cancelled: "destructive",
  };
  const labels: Record<string, string> = {
    pending: "En attente",
    picked_up: "Retiré",
    cancelled: "Annulé",
  };
  return <Badge variant={map[status] ?? "outline"}>{labels[status] ?? status}</Badge>;
}
