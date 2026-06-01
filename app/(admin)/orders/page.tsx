import { supabaseAdmin } from "@/lib/supabase";
import { todayInGP } from "@/lib/availability";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Link from "next/link";

const STATUSES = ["", "pending", "picked_up", "cancelled"] as const;
const STATUS_LABELS: Record<string, string> = {
  "": "Tous",
  pending: "En attente",
  picked_up: "Retiré",
  cancelled: "Annulé",
};

type Order = {
  id: string;
  pickup_date: string;
  pickup_slot: string;
  total_cents: number;
  status: string;
  items: { menu_item_id: string; qty: number }[];
  customers: { display_name: string | null; telegram_chat_id: number | string } | null;
};

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; status?: string }>;
}) {
  const params = await searchParams;
  const date = params.date ?? todayInGP();
  const status = params.status ?? "";

  let query = supabaseAdmin
    .from("orders")
    .select("id, pickup_date, pickup_slot, total_cents, status, items, customers(display_name, telegram_chat_id)")
    .eq("pickup_date", date)
    .order("pickup_slot", { ascending: true });

  if (status) {
    query = query.eq("status", status);
  }

  const { data: orders } = await query;

  const { data: menuItems } = await supabaseAdmin
    .from("menu_items")
    .select("id, name");

  const nameMap = new Map((menuItems ?? []).map((m) => [m.id, m.name]));

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <h1 className="text-2xl font-semibold">Commandes</h1>

      {/* Filters */}
      <form method="GET" className="flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1">
          <label htmlFor="date" className="text-xs font-medium text-zinc-600">
            Date
          </label>
          <input
            id="date"
            type="date"
            name="date"
            defaultValue={date}
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="status" className="text-xs font-medium text-zinc-600">
            Statut
          </label>
          <select
            id="status"
            name="status"
            defaultValue={status}
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="h-8 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/80 transition-colors"
        >
          Filtrer
        </button>
      </form>

      <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">N°</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Articles</TableHead>
              <TableHead className="w-20">Créneau</TableHead>
              <TableHead className="w-24 text-right">Total</TableHead>
              <TableHead className="w-28">Statut</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(orders as unknown as Order[] ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-zinc-400 py-8">
                  Aucune commande pour cette sélection.
                </TableCell>
              </TableRow>
            ) : (
              (orders as unknown as Order[]).map((o) => (
                <TableRow key={o.id}>
                  <TableCell>
                    <Link
                      href={`/orders/${o.id}`}
                      className="font-mono text-xs text-zinc-500 hover:text-zinc-900 underline underline-offset-2"
                    >
                      #{o.id.slice(0, 8)}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm">
                    {o.customers?.display_name ?? <span className="text-zinc-400">—</span>}
                  </TableCell>
                  <TableCell className="text-sm text-zinc-600">
                    {o.items
                      .map((it) => `${nameMap.get(it.menu_item_id) ?? "?"} ×${it.qty}`)
                      .join(", ")}
                  </TableCell>
                  <TableCell className="tabular-nums">{o.pickup_slot}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {(o.total_cents / 100).toFixed(2).replace(".", ",")} €
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={o.status} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
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
