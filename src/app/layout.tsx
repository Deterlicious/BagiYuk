import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { PwaRegister } from "@/components/pwa-register";
import "./globals.css";

const jakarta = localFont({
  src: "../../node_modules/@fontsource-variable/plus-jakarta-sans/files/plus-jakarta-sans-latin-wght-normal.woff2",
  variable: "--font-jakarta",
  weight: "200 800",
  style: "normal",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://bagiyuk.vivoy51577.workers.dev"),
  title: {
    default: "BagiYuk — Bagi tagihan tanpa hitung ulang",
    template: "%s · BagiYuk",
  },
  description:
    "Foto struk, pilih pesanan, dan lihat total setiap orang—termasuk pajak dan biaya layanan.",
  applicationName: "BagiYuk",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "BagiYuk",
  },
  icons: {
    icon: "/icons/icon.svg",
    apple: "/icons/icon-apple.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#f7f3e8",
  colorScheme: "light",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id" className={jakarta.variable} data-scroll-behavior="smooth">
      <head>
        <link rel="canonical" href="https://bagiyuk.vivoy51577.workers.dev/" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <meta property="og:type" content="website" />
        <meta property="og:locale" content="id_ID" />
        <meta property="og:site_name" content="BagiYuk" />
        <meta property="og:title" content="BagiYuk — Bagi tagihan tanpa hitung ulang" />
        <meta property="og:description" content="Foto struk, pilih pesanan, dan lihat total setiap orang—termasuk pajak dan biaya layanan." />
        <meta property="og:image" content="https://bagiyuk.vivoy51577.workers.dev/og-bagiyuk.png" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:alt" content="BagiYuk — Bagi tagihan tanpa hitung ulang" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="BagiYuk — Bagi tagihan tanpa hitung ulang" />
        <meta name="twitter:description" content="Foto struk, pilih pesanan, dan lihat total setiap orang." />
        <meta name="twitter:image" content="https://bagiyuk.vivoy51577.workers.dev/og-bagiyuk.png" />
      </head>
      <body>
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
