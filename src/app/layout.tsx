import "./globals.css";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
import { Providers } from "@/components/providers";
import { NavAuth } from "@/components/nav-auth";
import { NavBrand } from "@/components/nav-brand";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "InstantBandAI — AI-Powered Music Stems",
  description: "Upload any song. AI generates individual instrument stems you can mix and download.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-[#0a0a0a] text-white min-h-screen`}>
        <Providers>
          <nav className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
            <NavBrand />
            <div className="flex items-center gap-4">
              <Link href="/studio" className="px-4 py-2 bg-violet-600 hover:bg-violet-500 rounded-lg text-sm font-medium transition">
                Open Studio
              </Link>
              <NavAuth />
            </div>
          </nav>
          <main>{children}</main>
        </Providers>
      </body>
    </html>
  );
}
