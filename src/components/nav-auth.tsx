"use client";
import { useSession, signIn, signOut } from "next-auth/react";
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
    <button onClick={() => signIn("google")} className="px-4 py-2 border border-white/20 hover:border-white/40 rounded-lg text-sm font-medium transition text-white/70 hover:text-white">
      Sign in with Google
    </button>
  );
}
