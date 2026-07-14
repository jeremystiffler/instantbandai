"use client";
import { useSession, signIn, signOut } from "next-auth/react";
import { AuthBox } from "@/components/auth-box";
export function NavAuth() {
  const { data: session, status } = useSession();
  if (status === "loading") return null;
  if (session) return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-white/50 hidden sm:block">{session.user?.email}</span>
      <button onClick={() => signOut()} className="px-3 py-1.5 text-sm text-white/50 hover:text-white transition">Sign out</button>
    </div>
  );
  return (
    <div className="relative group">
      <button onClick={() => signIn("google")} className="px-4 py-2 border border-white/20 hover:border-white/40 rounded-lg text-sm font-medium transition text-white/70 hover:text-white">
        Sign in
      </button>
      <div className="absolute right-0 top-11 z-50 hidden w-80 rounded-2xl border border-white/10 bg-[#080614] p-4 shadow-2xl shadow-black/40 group-focus-within:block group-hover:block">
        <AuthBox compact />
      </div>
    </div>
  );
}
