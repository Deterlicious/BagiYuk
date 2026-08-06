import type { Metadata } from "next";
import { SplitWizard } from "@/components/split/split-wizard";

export const metadata: Metadata = {
  title: "Bagi tagihan baru",
  description: "Masukkan struk, pilih anggota, lalu bagikan hasil dengan jelas.",
};

export default async function NewSplitPage({
  searchParams,
}: {
  searchParams: Promise<{ sample?: string }>;
}) {
  const { sample } = await searchParams;
  return <SplitWizard initialSample={sample === "1"} />;
}
