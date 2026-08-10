import Link from "next/link";
import {
  ArrowRight,
  Camera,
  Check,
  LockKeyhole,
  ReceiptText,
  Send,
  UsersRound,
} from "lucide-react";
import { BrandMark } from "@/components/brand/brand-mark";
import { buttonStyles } from "@/components/ui/button";
import { formatRupiah } from "@/lib/currency";

const previewPeople = [
  { name: "Ayu", item: "Nasi goreng + ½ tahu", total: 45_500 },
  { name: "Bima", item: "Ayam bakar + ½ tahu", total: 55_350 },
  { name: "Citra", item: "Es teh manis", total: 10_150 },
];

export default function HomePage() {
  return (
    <main className="min-h-screen overflow-hidden">
      <header className="mx-auto flex w-full max-w-[1160px] items-center justify-between px-5 py-5 sm:px-8 lg:px-10">
        <BrandMark />
        <nav className="flex items-center gap-1" aria-label="Navigasi utama">
          <Link href="/bantuan" className="rounded-lg px-3 py-2 text-sm font-bold text-muted transition hover:bg-brand/8 hover:text-brand-strong focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/25">
            Bantuan
          </Link>
          <Link
            href="/split/new?fresh=1"
            className="rounded-lg px-3 py-2 text-sm font-bold text-brand-strong transition hover:bg-brand/8 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/25"
          >
            Buka pembagi
          </Link>
        </nav>
      </header>

      <section className="mx-auto grid w-full max-w-[1160px] items-center gap-12 px-5 pt-10 pb-20 sm:px-8 sm:pt-16 lg:grid-cols-[1.03fr_0.97fr] lg:gap-20 lg:px-10 lg:pt-20 lg:pb-28">
        <div>
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-accent/25 bg-accent-soft px-3 py-1.5 text-xs font-extrabold tracking-[0.08em] text-[#843c2d] uppercase">
            <ReceiptText aria-hidden="true" size={15} />
            Pembagi struk yang transparan
          </div>
          <h1 className="max-w-[680px] text-[clamp(2.5rem,7vw,4.9rem)] leading-[1.02] font-extrabold tracking-[-0.065em] text-ink">
            Bagi tagihan tanpa hitung ulang.
          </h1>
          <p className="mt-6 max-w-[620px] text-lg leading-8 font-medium text-muted sm:text-xl">
            Foto struk, pilih pesanan, dan lihat total setiap orang—termasuk pajak dan biaya layanan.
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link href="/split/new?fresh=1" className={buttonStyles({ className: "group min-w-52" })}>
              Mulai bagi tagihan
              <ArrowRight className="transition-transform group-hover:translate-x-0.5" aria-hidden="true" size={18} />
            </Link>
            <Link
              href="/split/new?sample=1"
              className={buttonStyles({ variant: "secondary", className: "min-w-44" })}
            >
              Coba data contoh
            </Link>
          </div>

          <div className="mt-9 flex max-w-[620px] items-start gap-3 border-t border-dashed border-line pt-5 text-sm leading-6 text-muted">
            <LockKeyhole className="mt-0.5 shrink-0 text-brand" aria-hidden="true" size={18} />
            <p>
              Pemindai pintar memproses foto sementara di layanan privat; jika tidak tersedia, OCR berjalan di perangkat. Foto tidak disimpan permanen.
            </p>
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-[480px] lg:mx-0 lg:ml-auto">
          <div className="absolute top-12 -right-7 hidden h-[78%] w-[90%] rotate-3 rounded-[24px] border border-line bg-[#eee6d6] lg:block" />
          <div className="receipt-edge relative rounded-t-[22px] border border-line bg-surface px-5 pt-5 pb-8 shadow-[0_24px_70px_rgba(49,43,31,0.15)] sm:px-7 sm:pt-7">
            <div className="flex items-start justify-between gap-4 border-b border-dashed border-line pb-5">
              <div>
                <p className="text-xs font-extrabold tracking-[0.12em] text-brand uppercase">Hasil pembagian</p>
                <h2 className="mt-1 text-xl font-extrabold tracking-[-0.03em]">Warung Sedap Sore</h2>
                <p className="mt-1 text-sm text-muted">3 orang · 4 item</p>
              </div>
              <span className="grid size-11 place-items-center rounded-full bg-brand text-white">
                <Check aria-hidden="true" size={21} strokeWidth={3} />
              </span>
            </div>

            <div className="divide-y divide-line">
              {previewPeople.map((person, index) => (
                <div key={person.name} className="grid grid-cols-[44px_1fr_auto] items-center gap-3 py-4">
                  <span
                    className="grid size-10 place-items-center rounded-full text-sm font-extrabold text-ink"
                    style={{ background: ["#DCEDE8", "#FDE8DF", "#F4E4B7"][index] }}
                  >
                    {person.name.charAt(0)}
                  </span>
                  <div className="min-w-0">
                    <p className="font-extrabold">{person.name}</p>
                    <p className="truncate text-xs text-muted">{person.item}</p>
                  </div>
                  <p className="price font-extrabold">{formatRupiah(person.total)}</p>
                </div>
              ))}
            </div>

            <div className="mt-2 flex items-end justify-between border-t-2 border-ink pt-4">
              <div>
                <p className="text-xs font-bold tracking-[0.08em] text-muted uppercase">Total cocok</p>
                <p className="mt-1 text-sm font-bold text-success">Termasuk pajak & layanan</p>
              </div>
              <p className="price text-2xl font-extrabold tracking-[-0.04em]">{formatRupiah(111_000)}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-line bg-surface/80">
        <div className="mx-auto w-full max-w-[1160px] px-5 py-14 sm:px-8 lg:px-10 lg:py-16">
          <p className="text-sm font-extrabold tracking-[0.1em] text-brand uppercase">Dari struk ke hasil</p>
          <h2 className="mt-2 text-3xl font-extrabold tracking-[-0.04em] sm:text-4xl">Tiga langkah yang mudah dijelaskan.</h2>
          <ol className="mt-9 grid border-y border-line md:grid-cols-3 md:divide-x md:divide-line">
            {[
              { icon: Camera, title: "Foto struk", text: "Ambil foto atau masukkan semua item secara manual." },
              { icon: UsersRound, title: "Pilih pesanan", text: "Periksa harga lalu pilih pemilik setiap item bersama." },
              { icon: Send, title: "Bagikan hasil", text: "Dapatkan total per orang yang sudah direkonsiliasi." },
            ].map((step, index) => {
              const Icon = step.icon;
              return (
                <li key={step.title} className="grid grid-cols-[48px_1fr] gap-4 border-b border-line py-6 last:border-b-0 md:block md:border-b-0 md:px-7 md:first:pl-0 md:last:pr-0">
                  <span className="grid size-11 place-items-center rounded-xl border border-line bg-white text-brand shadow-sm">
                    <Icon aria-hidden="true" size={21} />
                  </span>
                  <div className="md:mt-5">
                    <p className="text-xs font-extrabold tracking-[0.08em] text-accent uppercase">0{index + 1}</p>
                    <h3 className="mt-1 text-lg font-extrabold">{step.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-muted">{step.text}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      <footer className="mx-auto flex w-full max-w-[1160px] flex-col gap-3 px-5 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-10">
        <BrandMark />
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 sm:justify-end">
          <Link href="/bantuan" className="font-bold text-brand-strong hover:underline">Bantuan & privasi</Link>
          <p>Hitungan final selalu dikerjakan secara deterministik, bukan oleh AI.</p>
        </div>
      </footer>
    </main>
  );
}
