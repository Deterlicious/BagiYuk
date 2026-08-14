import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { BrandMark } from "@/components/brand/brand-mark";
import { SystemDiagnostics } from "@/components/diagnostics/system-diagnostics";
import { buttonStyles } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Diagnostik sistem",
  description: "Periksa kesiapan OCR, koneksi, kamera, dan penyimpanan lokal BagiYuk tanpa mengunggah struk.",
};

export default function DiagnosticsPage() {
  return (
    <main className="min-h-screen">
      <header className="border-b border-line bg-surface/80"><div className="mx-auto flex max-w-[1040px] items-center justify-between px-5 py-5 sm:px-8"><BrandMark /><Link href="/" className={buttonStyles({ variant: "ghost", size: "small" })}><ArrowLeft aria-hidden="true" size={17} /> Kembali</Link></div></header>
      <div className="mx-auto max-w-[1040px] px-5 py-12 sm:px-8 sm:py-16">
        <p className="text-sm font-extrabold tracking-[0.1em] text-brand uppercase">Diagnostik</p>
        <h1 className="mt-2 max-w-3xl text-4xl font-extrabold tracking-[-0.05em] sm:text-5xl">Pastikan perangkat siap sebelum memindai.</h1>
        <p className="mt-5 max-w-2xl text-base leading-7 text-muted">Halaman ini memeriksa kemampuan browser dan status layanan tanpa membaca, menyimpan, atau mengunggah foto.</p>
        <SystemDiagnostics />
      </div>
    </main>
  );
}
