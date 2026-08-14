import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Database, Eye, LockKeyhole, ScanLine, Trash2 } from "lucide-react";
import { BrandMark } from "@/components/brand/brand-mark";
import { buttonStyles } from "@/components/ui/button";

export const metadata: Metadata = { title: "Privasi", description: "Penjelasan transparan mengenai pemrosesan foto, draft lokal, dan analytics BagiYuk." };

const sections = [
  { icon: ScanLine, title: "Foto struk", text: "Foto berada di memori selama sesi. Bila pemindai pintar digunakan, browser membuat salinan JPEG tanpa metadata, mengompresinya hingga batas aman, lalu mengirimkannya sementara ke layanan OCR privat." },
  { icon: Trash2, title: "Tidak disimpan permanen", text: "BagiYuk tidak memasukkan foto ke local storage atau database. Layanan OCR memproses gambar di memori dan tidak menyimpan isi struk sebagai arsip." },
  { icon: Database, title: "Draft lokal", text: "Item, angka, anggota, dan pilihan pemilik disimpan sebagai JSON terstruktur di browser agar pekerjaan dapat dilanjutkan. Data ini dapat dihapus melalui tombol Mulai ulang atau data situs browser." },
  { icon: Eye, title: "Analytics minimal", text: "Pengukuran produk hanya memakai nama event yang sudah diizinkan. Foto, nama anggota, nama merchant, nominal, dan teks struk tidak pernah menjadi payload analytics." },
];

export default function PrivacyPage() {
  return (
    <main className="min-h-screen">
      <header className="border-b border-line bg-surface/80"><div className="mx-auto flex max-w-[960px] items-center justify-between px-5 py-5 sm:px-8"><BrandMark /><Link href="/" className={buttonStyles({ variant: "ghost", size: "small" })}><ArrowLeft aria-hidden="true" size={17} /> Kembali</Link></div></header>
      <div className="mx-auto max-w-[960px] px-5 py-12 sm:px-8 sm:py-16">
        <span className="grid size-12 place-items-center rounded-2xl bg-brand text-white"><LockKeyhole aria-hidden="true" size={24} /></span>
        <p className="mt-6 text-sm font-extrabold tracking-[0.1em] text-brand uppercase">Privasi BagiYuk</p>
        <h1 className="mt-2 max-w-3xl text-4xl font-extrabold tracking-[-0.05em] sm:text-5xl">Strukmu diproses seperlunya, bukan dikoleksi.</h1>
        <p className="mt-5 max-w-2xl text-base leading-7 text-muted">BagiYuk dirancang tanpa akun. OCR hanya membantu membuat isian yang tetap wajib kamu periksa; kalkulator deterministik memegang hasil akhir.</p>
        <div className="mt-10 grid gap-4 sm:grid-cols-2">{sections.map(({ icon: Icon, title, text }) => <section key={title} className="rounded-2xl border border-line bg-surface p-5 shadow-sm"><span className="grid size-10 place-items-center rounded-xl bg-brand/8 text-brand"><Icon aria-hidden="true" size={20} /></span><h2 className="mt-4 text-lg font-extrabold">{title}</h2><p className="mt-2 text-sm leading-6 text-muted">{text}</p></section>)}</div>
        <section className="mt-8 rounded-2xl border border-accent/25 bg-accent-soft p-5 sm:p-6"><h2 className="font-extrabold">Kontrol ada di perangkatmu</h2><p className="mt-2 text-sm leading-6 text-muted">Gunakan input manual bila tidak ingin mengirim foto ke server. OCR lokal tetap tersedia setelah model termuat. Untuk menghapus draft, pilih “Mulai ulang” di alur pembagian atau hapus data situs BagiYuk dari pengaturan browser.</p></section>
        <div className="mt-8 flex flex-wrap gap-3"><Link href="/split/new?fresh=1" className={buttonStyles()}>Mulai bagi tagihan</Link><Link href="/diagnostik" className={buttonStyles({ variant: "secondary" })}>Buka diagnostik</Link></div>
      </div>
    </main>
  );
}
