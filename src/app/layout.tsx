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
      <body>
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
