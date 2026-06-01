import { supabaseAdmin } from "@/lib/supabase";
import { revalidatePath } from "next/cache";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type MenuItem = {
  id: string;
  name: string;
  price_cents: number;
  daily_quota: number;
  active: boolean;
};

export default async function MenuPage() {
  const { data: items } = await supabaseAdmin
    .from("menu_items")
    .select("id, name, price_cents, daily_quota, active")
    .order("name");

  async function updateItem(formData: FormData) {
    "use server";
    const id = formData.get("id") as string;
    const price_cents = Math.round(Number(formData.get("price_euros")) * 100);
    const daily_quota = Number(formData.get("daily_quota"));
    const active = formData.get("active") === "on";

    await supabaseAdmin
      .from("menu_items")
      .update({ price_cents, daily_quota, active })
      .eq("id", id);

    revalidatePath("/menu");
  }

  const rows = items as MenuItem[] ?? [];

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <h1 className="text-2xl font-semibold">Menu</h1>

      {/* Forms live outside the table to keep valid HTML; inputs reference them via form= */}
      {rows.map((item) => (
        <form key={item.id} id={`menu-${item.id}`} action={updateItem}>
          <input type="hidden" name="id" value={item.id} />
        </form>
      ))}

      <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Plat</TableHead>
              <TableHead className="w-32">Prix (€)</TableHead>
              <TableHead className="w-28">Quota/jour</TableHead>
              <TableHead className="w-20">Actif</TableHead>
              <TableHead className="w-28" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-zinc-400 py-8">
                  Aucun plat.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">
                    {item.name}
                    {!item.active && (
                      <Badge variant="outline" className="ml-2 text-xs">
                        Inactif
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Input
                      form={`menu-${item.id}`}
                      type="number"
                      name="price_euros"
                      step="0.01"
                      min="0"
                      defaultValue={(item.price_cents / 100).toFixed(2)}
                      className="h-7 w-24 text-sm"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      form={`menu-${item.id}`}
                      type="number"
                      name="daily_quota"
                      min="0"
                      defaultValue={item.daily_quota}
                      className="h-7 w-20 text-sm"
                    />
                  </TableCell>
                  <TableCell>
                    <input
                      form={`menu-${item.id}`}
                      type="checkbox"
                      name="active"
                      defaultChecked={item.active}
                      className="h-4 w-4 rounded border-zinc-300"
                    />
                  </TableCell>
                  <TableCell>
                    <Button form={`menu-${item.id}`} type="submit" size="sm" variant="outline">
                      Sauvegarder
                    </Button>
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
