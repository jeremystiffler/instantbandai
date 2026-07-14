"use client";

import { FormEvent, Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const initialEmail = useMemo(() => searchParams.get("email") || "", [searchParams]);
  const token = searchParams.get("token") || "";
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not reset password.");
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center shadow-2xl shadow-black/20">
        <h1 className="text-2xl font-bold text-white">Reset link missing</h1>
        <p className="mt-3 text-sm text-white/60">Use the password reset link from your email, or request a new one from the login form.</p>
        <Link href="/studio" className="mt-6 inline-flex rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-violet-500">
          Back to sign in
        </Link>
      </div>
    );
  }

  if (success) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center shadow-2xl shadow-black/20">
        <h1 className="text-2xl font-bold text-white">Password reset</h1>
        <p className="mt-3 text-sm text-white/60">Your password has been updated. You can sign in now.</p>
        <button
          type="button"
          onClick={() => signIn("credentials", { email, password, callbackUrl: "/studio" })}
          className="mt-6 w-full rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-violet-500"
        >
          Sign in
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 shadow-2xl shadow-black/20">
      <h1 className="text-2xl font-bold text-white">Choose a new password</h1>
      <p className="mt-2 text-sm text-white/55">Enter the email for your InstantBandAI account and a new password.</p>

      <div className="mt-6 space-y-3">
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
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="New password"
          minLength={8}
          required
          className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-violet-400"
        />
        <input
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Confirm new password"
          minLength={8}
          required
          className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-violet-400"
        />
      </div>

      {error && <p className="mt-3 text-sm text-red-300">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="mt-5 w-full rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "Resetting…" : "Reset password"}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <section className="mx-auto flex min-h-[calc(100vh-73px)] w-full max-w-md items-center px-6 py-16">
      <Suspense fallback={<div className="text-white/60">Loading…</div>}>
        <ResetPasswordForm />
      </Suspense>
    </section>
  );
}
