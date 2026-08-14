"use client";

import Link from "next/link";
import { AlertTriangle, Home, RefreshCw } from "lucide-react";
import { Button, buttonStyles } from "@/components/ui/button";

export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main className="grid min-h-screen place-items-center px-5 py-12">
      <section className="w-full max-w-lg rounded-2xl border border-danger/20 bg-surface p-6 text-center shadow-sm sm:p-8">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-red-50 text-danger"><AlertTriangle aria-hidden="true" size={24} /></span>
        <p className="mt-5 text-sm font-extrabold tracking-[0.1em] text-danger uppercase">Terjadi gangguan</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-[-0.04em]">Halaman belum berhasil dimuat.</h1>
        <p className="mt-3 text-sm leading-6 text-muted">Draft yang sudah tersimpan tetap ada di perangkat. Coba muat ulang bagian ini atau kembali ke beranda.</p>
        {error.digest && <p className="mt-3 text-xs text-muted">Referensi: {error.digest}</p>}
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row"><Button onClick={retry}><RefreshCw aria-hidden="true" size={18} /> Coba lagi</Button><Link href="/" className={buttonStyles({ variant: "secondary" })}><Home aria-hidden="true" size={18} /> Ke beranda</Link></div>
      </section>
    </main>
  );
}
