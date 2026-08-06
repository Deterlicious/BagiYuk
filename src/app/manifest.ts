import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "BagiYuk — Bagi tagihan",
    short_name: "BagiYuk",
    description: "Bagi tagihan makan per item dengan pajak dan layanan yang transparan.",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f3e8",
    theme_color: "#0e6b5c",
    lang: "id-ID",
    orientation: "portrait-primary",
    icons: [
      {
        src: "/icons/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
