import { NextResponse } from "next/server";
import {
  renderToBuffer,
  Document,
  Page,
  View,
  Text,
  StyleSheet,
} from "@react-pdf/renderer";
import { supabaseAdmin } from "@/lib/supabase";
import { requireApiKey } from "@/lib/auth";
import { todayInGP, weekdayOf } from "@/lib/availability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type OrderItem = { menu_item_id: string; qty: number };

const euros = (cents: number) =>
  (cents / 100).toFixed(2).replace(".", ",") + " €";

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 10, fontFamily: "Helvetica", color: "#1a1a1a" },
  h1: { fontSize: 18, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  sub: { fontSize: 10, color: "#555", marginBottom: 8 },
  section: { fontSize: 13, fontFamily: "Helvetica-Bold", marginTop: 16, marginBottom: 6 },
  prepRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3, borderBottom: "1px solid #eee" },
  prepName: { fontSize: 11 },
  prepQty: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  thead: { flexDirection: "row", backgroundColor: "#f0723a", color: "#ffffff", paddingVertical: 4, paddingHorizontal: 4, fontFamily: "Helvetica-Bold", fontSize: 9 },
  row: { flexDirection: "row", paddingVertical: 4, paddingHorizontal: 4, borderBottom: "1px solid #eee" },
  cSlot: { width: "12%" },
  cNum: { width: "13%" },
  cClient: { width: "22%" },
  cItems: { width: "37%" },
  cTotal: { width: "16%", textAlign: "right" },
  empty: { marginTop: 12, fontSize: 12, color: "#777" },
  footer: { marginTop: 20, fontSize: 11, fontFamily: "Helvetica-Bold", textAlign: "right" },
});

type Row = { num: string; slot: string; client: string; items: string; total: string };

function DailyDoc({
  date,
  location,
  prepList,
  rows,
  count,
  revenue,
}: {
  date: string;
  location: { name: string; address: string } | null;
  prepList: { name: string; qty: number }[];
  rows: Row[];
  count: number;
  revenue: string;
}) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.h1}>Le Petit Camion — Commandes</Text>
        <Text style={styles.sub}>
          {date}
          {location ? `  •  ${location.name} (${location.address})` : ""}
          {`  •  ${count} commande${count > 1 ? "s" : ""}`}
        </Text>

        <Text style={styles.section}>À préparer</Text>
        {prepList.length === 0 ? (
          <Text style={styles.empty}>Aucune commande pour cette date.</Text>
        ) : (
          prepList.map((p, i) => (
            <View style={styles.prepRow} key={i}>
              <Text style={styles.prepName}>{p.name}</Text>
              <Text style={styles.prepQty}>{p.qty}</Text>
            </View>
          ))
        )}

        {rows.length > 0 && (
          <>
            <Text style={styles.section}>Détail par créneau</Text>
            <View style={styles.thead}>
              <Text style={styles.cSlot}>Créneau</Text>
              <Text style={styles.cNum}>N°</Text>
              <Text style={styles.cClient}>Client</Text>
              <Text style={styles.cItems}>Items</Text>
              <Text style={styles.cTotal}>Total</Text>
            </View>
            {rows.map((r, i) => (
              <View style={styles.row} key={i}>
                <Text style={styles.cSlot}>{r.slot}</Text>
                <Text style={styles.cNum}>{r.num}</Text>
                <Text style={styles.cClient}>{r.client}</Text>
                <Text style={styles.cItems}>{r.items}</Text>
                <Text style={styles.cTotal}>{r.total}</Text>
              </View>
            ))}
            <Text style={styles.footer}>CA du jour : {revenue}</Text>
          </>
        )}
      </Page>
    </Document>
  );
}

export async function GET(request: Request) {
  const authError = requireApiKey(request);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date") || todayInGP();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { error: "Param 'date' invalide (format YYYY-MM-DD attendu)." },
      { status: 400 }
    );
  }

  const { data: orders, error: ordersErr } = await supabaseAdmin
    .from("orders")
    .select("id, pickup_slot, items, total_cents, status, customer_id")
    .eq("pickup_date", date)
    .neq("status", "cancelled")
    .order("pickup_slot", { ascending: true });
  if (ordersErr) {
    return NextResponse.json({ error: ordersErr.message }, { status: 500 });
  }

  const { data: menu } = await supabaseAdmin.from("menu_items").select("id, name");
  const nameMap = new Map((menu ?? []).map((m) => [m.id, m.name]));

  const customerIds = [...new Set((orders ?? []).map((o) => o.customer_id))];
  let customers: { id: string; display_name: string | null }[] = [];
  if (customerIds.length) {
    const r = await supabaseAdmin
      .from("customers")
      .select("id, display_name")
      .in("id", customerIds);
    customers = r.data ?? [];
  }
  const clientMap = new Map(customers.map((c) => [c.id, c.display_name]));

  const { data: location } = await supabaseAdmin
    .from("locations")
    .select("name, address")
    .eq("weekday", weekdayOf(date))
    .single();

  const prep = new Map<string, number>();
  for (const o of orders ?? []) {
    for (const it of (o.items as OrderItem[]) ?? []) {
      prep.set(it.menu_item_id, (prep.get(it.menu_item_id) ?? 0) + it.qty);
    }
  }
  const prepList = [...prep.entries()]
    .map(([id, qty]) => ({ name: nameMap.get(id) ?? id, qty }))
    .sort((a, b) => b.qty - a.qty);

  const totalRevenue = (orders ?? []).reduce((s, o) => s + o.total_cents, 0);

  const rows: Row[] = (orders ?? []).map((o) => ({
    num: o.id.slice(0, 8),
    slot: String(o.pickup_slot).slice(0, 5),
    client: clientMap.get(o.customer_id) ?? "—",
    items: ((o.items as OrderItem[]) ?? [])
      .map((it) => `${nameMap.get(it.menu_item_id) ?? "?"} ×${it.qty}`)
      .join(", "),
    total: euros(o.total_cents),
  }));

  const buffer = await renderToBuffer(
    <DailyDoc
      date={date}
      location={location ?? null}
      prepList={prepList}
      rows={rows}
      count={rows.length}
      revenue={euros(totalRevenue)}
    />
  );

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="commandes-${date}.pdf"`,
    },
  });
}