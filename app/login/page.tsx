import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { login } from "./actions";

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50">
      <div className="w-full max-w-sm p-8 bg-white rounded-xl border border-zinc-200 shadow-sm">
        <h1 className="text-xl font-semibold mb-1">Petit Camion</h1>
        <p className="text-sm text-zinc-500 mb-6">Administration</p>
        <form action={login} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">Mot de passe</Label>
            <Input
              id="password"
              type="password"
              name="password"
              placeholder="••••••••"
              required
              autoFocus
            />
          </div>
          <Button type="submit" className="w-full">
            Se connecter
          </Button>
        </form>
        {/* searchParams is async in Next.js 16 — error is read server-side via the prop */}
        <ErrorMessage searchParams={searchParams} />
      </div>
    </div>
  );
}

async function ErrorMessage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  if (!params.error) return null;
  return (
    <p className="mt-3 text-sm text-destructive text-center">
      Mot de passe incorrect.
    </p>
  );
}
