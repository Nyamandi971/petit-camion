import { supabaseAdmin } from "@/lib/supabase";
import { revalidatePath } from "next/cache";
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

const DAY_NAMES = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

type Location = {
  weekday: number;
  name: string;
  address: string;
  open: boolean;
};

export default async function LocationsPage() {
  const { data: locations } = await supabaseAdmin
    .from("locations")
    .select("weekday, name, address, open");

  const byWeekday = new Map((locations as Location[] ?? []).map((l) => [l.weekday, l]));

  async function updateLocation(formData: FormData) {
    "use server";
    const weekday = Number(formData.get("weekday"));
    const name = (formData.get("name") as string).trim();
    const address = (formData.get("address") as string).trim();
    const open = formData.get("open") === "on";

    await supabaseAdmin
      .from("locations")
      .upsert({ weekday, name, address, open }, { onConflict: "weekday" });

    revalidatePath("/locations");
  }

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <h1 className="text-2xl font-semibold">Planning hebdomadaire</h1>

      {/* Forms defined outside table for valid HTML; inputs reference via form= */}
      {DISPLAY_ORDER.map((weekday) => (
        <form key={weekday} id={`loc-${weekday}`} action={updateLocation}>
          <input type="hidden" name="weekday" value={weekday} />
        </form>
      ))}

      <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">Jour</TableHead>
              <TableHead>Nom du lieu</TableHead>
              <TableHead>Adresse</TableHead>
              <TableHead className="w-20">Ouvert</TableHead>
              <TableHead className="w-28" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {DISPLAY_ORDER.map((weekday) => {
              const loc = byWeekday.get(weekday);
              return (
                <TableRow key={weekday}>
                  <TableCell className="font-medium text-sm">
                    {DAY_NAMES[weekday]}
                  </TableCell>
                  <TableCell>
                    <Input
                      form={`loc-${weekday}`}
                      type="text"
                      name="name"
                      defaultValue={loc?.name ?? ""}
                      placeholder="Nom du lieu"
                      className="h-7 text-sm"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      form={`loc-${weekday}`}
                      type="text"
                      name="address"
                      defaultValue={loc?.address ?? ""}
                      placeholder="Adresse"
                      className="h-7 text-sm"
                    />
                  </TableCell>
                  <TableCell>
                    <input
                      form={`loc-${weekday}`}
                      type="checkbox"
                      name="open"
                      defaultChecked={loc?.open ?? false}
                      className="h-4 w-4 rounded border-zinc-300"
                    />
                  </TableCell>
                  <TableCell>
                    <Button form={`loc-${weekday}`} type="submit" size="sm" variant="outline">
                      Sauvegarder
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-zinc-400">
        Le dimanche est affiché en dernier. Décocher &quot;Ouvert&quot; bloque les nouvelles
        commandes pour ce jour.
      </p>
    </div>
  );
}
