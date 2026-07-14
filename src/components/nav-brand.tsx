"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";

export function NavBrand() {
  const { data: session } = useSession();

  return (
    <Link
      href={session ? "/studio" : "/"}
      className="text-xl font-bold bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent"
    >
      InstantBandAI
    </Link>
  );
}
