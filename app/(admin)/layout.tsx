import Link from "next/link";
import { Button } from "@/components/ui/button";
import { logout } from "@/app/login/actions";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-10 border-b bg-white px-6 py-3 flex items-center justify-between">
        <nav className="flex items-center gap-6 text-sm font-medium">
          <Link href="/" className="font-bold text-base tracking-tight">
            🚚 Petit Camion
          </Link>
          <Link href="/" className="text-zinc-600 hover:text-zinc-900 transition-colors">
            Dashboard
          </Link>
          <Link href="/orders" className="text-zinc-600 hover:text-zinc-900 transition-colors">
            Commandes
          </Link>
          <Link href="/menu" className="text-zinc-600 hover:text-zinc-900 transition-colors">
            Menu
          </Link>
          <Link href="/locations" className="text-zinc-600 hover:text-zinc-900 transition-colors">
            Planning
          </Link>
        </nav>
        <form action={logout}>
          <Button type="submit" variant="ghost" size="sm">
            Déconnexion
          </Button>
        </form>
      </header>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
