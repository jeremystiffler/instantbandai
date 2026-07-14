"use client";

import { FormEvent, useState } from "react";
import { signIn } from "next-auth/react";

export function AuthBox({ compact = false }: { compact?: boolean }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submitEmail(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "signup") {
        const res = await fetch("/api/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, name }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Could not create account.");
      }

      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) throw new Error("Invalid email or password.");
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={compact ? "w-full max-w-sm" : "w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.03] p-6 shadow-2xl shadow-black/20"}>
      <button
        type="button"
        onClick={() => signIn("google")}
        className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-semibold text-white/85 transition hover:border-white/30 hover:bg-white/10"
      >
        Continue with Google
      </button>

      <div className="my-4 flex items-center gap-3 text-xs uppercase tracking-[0.2em] text-white/35">
        <span className="h-px flex-1 bg-white/10" />
        or
        <span className="h-px flex-1 bg-white/10" />
      </div>

      <div className="mb-3 grid grid-cols-2 rounded-xl bg-white/5 p-1 text-sm">
        <button
          type="button"
          onClick={() => { setMode("signin"); setError(""); }}
          className={`rounded-lg px-3 py-2 transition ${mode === "signin" ? "bg-violet-600 text-white" : "text-white/50 hover:text-white"}`}
        >
          Email login
        </button>
        <button
          type="button"
          onClick={() => { setMode("signup"); setError(""); }}
          className={`rounded-lg px-3 py-2 transition ${mode === "signup" ? "bg-violet-600 text-white" : "text-white/50 hover:text-white"}`}
        >
          Create account
        </button>
      </div>

      <form onSubmit={submitEmail} className="space-y-3">
        {mode === "signup" && (
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name (optional)"
            className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-violet-400"
          />
        )}
        <input
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email address"
          required
          className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-violet-400"
        />
        <input
          type="password"
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          required
          minLength={8}
          className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-violet-400"
        />
        {error && <p className="text-sm text-red-300">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Working…" : mode === "signin" ? "Sign in with email" : "Create account"}
        </button>
      </form>
    </div>
  );
}
