import Link from "next/link";
import { ArrowLeft, ReceiptText } from "lucide-react";
import { buttonStyles } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center px-5 py-12">
      <section className="w-full max-w-lg text-center"><span className="mx-auto grid size-14 place-items-center rounded-2xl bg-brand text-white"><ReceiptText aria-hidden="true" size={27} /></span><p className="mt-6 text-sm font-extrabold tracking-[0.12em] text-brand uppercase">404 · Halaman tidak ditemukan</p><h1 className="mt-2 text-4xl font-extrabold tracking-[-0.05em]">Sepertinya struknya terselip.</h1><p className="mt-4 text-base leading-7 text-muted">Alamat ini tidak tersedia. Kembali ke beranda atau mulai pembagian tagihan baru.</p><div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row"><Link href="/" className={buttonStyles({ variant: "secondary" })}><ArrowLeft aria-hidden="true" size={18} /> Ke beranda</Link><Link href="/split/new?fresh=1" className={buttonStyles()}>Mulai bagi tagihan</Link></div></section>
    </main>
  );
}
