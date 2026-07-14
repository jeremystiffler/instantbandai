"use client";

import { FormEvent, useState } from "react";
import { signIn } from "next-auth/react";

export function AuthBox({ compact = false }: { compact?: boolean }) {
  const [mode, setMode] = useState<"signin" | "signup" | "reset">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  function switchMode(nextMode: "signin" | "signup" | "reset") {
    setMode(nextMode);
    setError("");
    setNotice("");
  }

  async function submitReset(e: FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/request-password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not start password reset.");
      setNotice(data.message || "If that email has an account, a reset link will be sent.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function submitEmail(e: FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");
    setLoading(true);
    try {
      if (mode === "reset") {
        await submitReset(e);
        return;
      }

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
        callbackUrl: "/studio",
      });

      if (result?.error) throw new Error("Invalid email or password.");
      window.location.href = result?.url || "/studio";
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
        onClick={() => signIn("google", { callbackUrl: "/studio" })}
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
          onClick={() => switchMode("signin")}
          className={`rounded-lg px-3 py-2 transition ${mode === "signin" || mode === "reset" ? "bg-violet-600 text-white" : "text-white/50 hover:text-white"}`}
        >
          Email login
        </button>
        <button
          type="button"
          onClick={() => switchMode("signup")}
          className={`rounded-lg px-3 py-2 transition ${mode === "signup" ? "bg-violet-600 text-white" : "text-white/50 hover:text-white"}`}
        >
          Create account
        </button>
      </div>

      {mode === "reset" ? (
        <form onSubmit={submitReset} className="space-y-3">
          <p className="text-sm text-white/55">Enter your email and we&apos;ll send a secure link to reset your password.</p>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email address"
            required
            className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-violet-400"
          />
          {error && <p className="text-sm text-red-300">{error}</p>}
          {notice && <p className="text-sm text-emerald-300">{notice}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Sending…" : "Send reset link"}
          </button>
          <button type="button" onClick={() => switchMode("signin")} className="w-full text-center text-sm text-white/50 transition hover:text-white">
            Back to sign in
          </button>
        </form>
      ) : (
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
          {mode === "signin" && (
            <button type="button" onClick={() => switchMode("reset")} className="text-sm text-violet-300 transition hover:text-violet-200">
              Forgot your password?
            </button>
          )}
          {error && <p className="text-sm text-red-300">{error}</p>}
          {notice && <p className="text-sm text-emerald-300">{notice}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Working…" : mode === "signin" ? "Sign in with email" : "Create account"}
          </button>
        </form>
      )}
    </div>
  );
}
