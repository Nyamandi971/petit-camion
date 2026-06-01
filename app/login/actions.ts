"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export async function login(formData: FormData) {
  const password = formData.get("password") as string;

  if (!process.env.ADMIN_PASSWORD || password !== process.env.ADMIN_PASSWORD) {
    redirect("/login?error=1");
  }

  const store = await cookies();
  store.set("admin_token", password, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 7,
    sameSite: "lax",
    path: "/",
  });

  redirect("/");
}

export async function logout() {
  const store = await cookies();
  store.delete("admin_token");
  redirect("/login");
}
