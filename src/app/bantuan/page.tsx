import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Camera, Calculator, LockKeyhole, ReceiptText, WifiOff } from "lucide-react";
import { BrandMark } from "@/components/brand/brand-mark";
import { buttonStyles } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Bantuan & Privasi",
  description: "Cara memotret, memeriksa, dan membagi struk dengan aman di BagiYuk.",
};

const guides = [
  { icon: Camera, title: "Foto yang mudah dibaca", text: "Letakkan struk di permukaan datar, gunakan cahaya merata, hindari bayangan, dan pastikan bagian total tidak terpotong." },
  { icon: ReceiptText, title: "Selalu periksa hasil scan", text: "OCR hanya membantu mengetik. Koreksi nama item, jumlah, harga, pajak, layanan, diskon, pembulatan, dan total sebelum melanjutkan." },
  { icon: Calculator, title: "Hitungan yang transparan", text: "Item bersama dibagi deterministik. Pajak dan layanan dibagi proporsional terhadap subtotal setiap orang, sampai rupiah terakhir." },
  { icon: WifiOff, title: "Tetap bisa tanpa OCR", text: "Jika model belum terunduh, internet lambat, atau scan gagal, gunakan input manual dan lanjutkan seluruh alur seperti biasa." },
];

export default function HelpPage() {
  return (
    <main className="min-h-screen">
      <header className="border-b border-line bg-surface/80">
        <div className="mx-auto flex max-w-[1040px] items-center justify-between gap-4 px-5 py-5 sm:px-8">
          <BrandMark />
          <Link href="/" className={buttonStyles({ variant: "ghost", size: "small" })}>
            <ArrowLeft aria-hidden="true" size={17} /> Kembali
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-[1040px] px-5 py-12 sm:px-8 sm:py-16">
        <p className="text-sm font-extrabold tracking-[0.1em] text-brand uppercase">Bantuan & privasi</p>
        <h1 className="mt-2 max-w-3xl text-4xl font-extrabold tracking-[-0.05em] sm:text-5xl">Hasil yang akurat dimulai dari pemeriksaan yang jelas.</h1>
        <p className="mt-5 max-w-2xl text-base leading-7 text-muted">Panduan singkat untuk mendapatkan hasil scan yang lebih baik dan memahami bagaimana BagiYuk menangani datamu.</p>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {guides.map(({ icon: Icon, title, text }) => (
            <article key={title} className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
              <span className="grid size-11 place-items-center rounded-xl bg-brand/8 text-brand"><Icon aria-hidden="true" size={21} /></span>
              <h2 className="mt-4 text-lg font-extrabold">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-muted">{text}</p>
            </article>
          ))}
        </div>

        <section className="mt-10 rounded-2xl border border-brand/20 bg-brand/5 p-5 sm:p-7">
          <div className="flex items-start gap-3">
            <LockKeyhole className="mt-1 shrink-0 text-brand" aria-hidden="true" size={23} />
            <div>
              <h2 className="text-xl font-extrabold">Privasi struk</h2>
              <p className="mt-2 text-sm leading-6 text-muted">Foto diproses di perangkat, tidak diunggah, tidak dimasukkan ke draft, dan tidak disimpan permanen. Draft hanya berisi data teks yang sudah dinormalisasi. Analytics hanya mencatat jenis interaksi yang telah dibatasi—tanpa foto, nama, nominal, atau isi struk.</p>
            </div>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-2xl font-extrabold">Pertanyaan umum</h2>
          <div className="mt-4 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {[
              ["Kenapa total bisa berbeda?", "Biasanya subtotal item, pajak, layanan, diskon, pembulatan, atau total pada struk belum sesuai. BagiYuk menampilkan selisih dan tidak menyembunyikannya."],
              ["Apakah AI menentukan tagihan seseorang?", "Tidak. OCR hanya menghasilkan isian yang dapat diedit. Perhitungan akhir dilakukan oleh kalkulator deterministik dengan nominal rupiah integer."],
              ["Kenapa scan pertama lebih lama?", "Model OCR perlu diunduh satu kali ke browser. Setelah tersimpan di cache, pemindaian berikutnya biasanya lebih cepat."],
              ["Apakah saya harus memasang aplikasi?", "Tidak. BagiYuk langsung berfungsi di browser. Instalasi PWA hanya membuat akses dari layar utama lebih nyaman."],
            ].map(([question, answer]) => (
              <details key={question} className="group p-5">
                <summary className="cursor-pointer font-extrabold marker:text-brand">{question}</summary>
                <p className="mt-3 text-sm leading-6 text-muted">{answer}</p>
              </details>
            ))}
          </div>
        </section>

        <div className="mt-10"><Link href="/split/new?fresh=1" className={buttonStyles()}>Mulai bagi tagihan</Link></div>
      </section>
    </main>
  );
}
