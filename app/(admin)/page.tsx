import { supabaseAdmin } from "@/lib/supabase";
import { todayInGP } from "@/lib/availability";
import { formatInTimeZone } from "date-fns-tz";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

const TZ = "America/Guadeloupe";

type OrderRow = {
  id: string;
  status: string;
  pickup_slot: string;
  total_cents: number;
  items: { menu_item_id: string; qty: number }[];
};

export default async function DashboardPage() {
  const today = todayInGP();
  const nowSlot = formatInTimeZone(new Date(), TZ, "HH:mm");

  const [{ data: orders }, { data: menuItems }] = await Promise.all([
    supabaseAdmin.from("orders").select("id, status, pickup_slot, total_cents, items").eq("pickup_date", today),
    supabaseAdmin.from("menu_items").select("id, name, daily_quota").eq("active", true),
  ]);

  const active = (orders as OrderRow[] ?? []).filter((o) => o.status !== "cancelled");

  const ca = active.reduce((sum, o) => sum + o.total_cents, 0);

  const consumed: Record<string, number> = {};
  for (const o of active) {
    for (const it of o.items) {
      consumed[it.menu_item_id] = (consumed[it.menu_item_id] || 0) + it.qty;
    }
  }

  const outOfStock = (menuItems ?? []).filter((m) => (consumed[m.id] || 0) >= m.daily_quota);

  const pending = active.filter((o) => o.status === "pending" && o.pickup_slot >= nowSlot);
  const nextSlot = pending.length > 0 ? [...pending].sort((a, b) => a.pickup_slot.localeCompare(b.pickup_slot))[0].pickup_slot : null;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p className="text-sm text-zinc-500">
        {today} — {nowSlot} (heure Guadeloupe)
      </p>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Commandes aujourd'hui" value={String(active.length)} />
        <StatCard label="CA du jour" value={`${(ca / 100).toFixed(2).replace(".", ",")} €`} />
        <StatCard label="Prochain retrait" value={nextSlot ?? "—"} />
        <StatCard
          label="Ruptures de stock"
          value={String(outOfStock.length)}
          alert={outOfStock.length > 0}
        />
      </div>

      {outOfStock.length > 0 && (
        <section className="bg-white rounded-xl border border-zinc-200 p-4 space-y-2">
          <h2 className="text-sm font-semibold">Plats en rupture</h2>
          <div className="flex flex-wrap gap-2">
            {outOfStock.map((m) => (
              <Badge key={m.id} variant="destructive">
                {m.name}
              </Badge>
            ))}
          </div>
        </section>
      )}

      <section className="bg-white rounded-xl border border-zinc-200 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Commandes du jour</h2>
          <Link href="/orders" className="text-xs text-zinc-500 hover:text-zinc-900">
            Voir tout →
          </Link>
        </div>
        {active.length === 0 ? (
          <p className="text-sm text-zinc-400">Aucune commande aujourd&apos;hui.</p>
        ) : (
          <div className="divide-y text-sm">
            {active.slice(0, 8).map((o) => (
              <div key={o.id} className="flex items-center justify-between py-2">
                <Link href={`/orders/${o.id}`} className="font-mono text-xs text-zinc-500 hover:text-zinc-900">
                  #{o.id.slice(0, 8)}
                </Link>
                <span className="text-zinc-600">{o.pickup_slot}</span>
                <span>{(o.total_cents / 100).toFixed(2).replace(".", ",")} €</span>
                <StatusBadge status={o.status} />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function StatCard({ label, value, alert }: { label: string; value: string; alert?: boolean }) {
  return (
    <div className={`bg-white rounded-xl border p-4 space-y-1 ${alert ? "border-destructive/50" : "border-zinc-200"}`}>
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={`text-2xl font-semibold tabular-nums ${alert ? "text-destructive" : ""}`}>{value}</p>
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
