"use client";

import { AlertTriangle, CheckCircle2, RefreshCw, ShieldCheck, WifiOff } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { getServerOcrConfig, type ServerOcrConfig } from "@/features/receipt-parser/server-client";

type BrowserChecks = {
  online: boolean;
  localOcr: boolean;
  imageProcessing: boolean;
  camera: boolean;
  draftStorage: boolean;
  installed: boolean;
};

function readBrowserChecks(): BrowserChecks {
  let draftStorage = false;
  try {
    const key = "bagiyuk:diagnostic";
    window.localStorage.setItem(key, "ok");
    window.localStorage.removeItem(key);
    draftStorage = true;
  } catch {
    draftStorage = false;
  }
  return {
    online: navigator.onLine,
    localOcr: typeof Worker !== "undefined" && typeof WebAssembly !== "undefined",
    imageProcessing: typeof createImageBitmap === "function",
    camera: Boolean(navigator.mediaDevices?.getUserMedia),
    draftStorage,
    installed: window.matchMedia("(display-mode: standalone)").matches,
  };
}

export function SystemDiagnostics() {
  const [checks, setChecks] = useState<BrowserChecks | null>(null);
  const [server, setServer] = useState<ServerOcrConfig | null>(null);
  const [checking, setChecking] = useState(true);

  const runChecks = useCallback(async (signal?: AbortSignal) => {
    setChecking(true);
    setChecks(readBrowserChecks());
    setServer(await getServerOcrConfig(signal));
    if (!signal?.aborted) setChecking(false);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => void runChecks(controller.signal));
    const updateConnection = () => setChecks(readBrowserChecks());
    window.addEventListener("online", updateConnection);
    window.addEventListener("offline", updateConnection);
    return () => {
      controller.abort();
      window.removeEventListener("online", updateConnection);
      window.removeEventListener("offline", updateConnection);
    };
  }, [runChecks]);

  const rows = checks ? [
    { label: "Koneksi internet", ok: checks.online, detail: checks.online ? "Online" : "Offline—input manual tetap tersedia" },
    { label: "OCR lokal", ok: checks.localOcr, detail: checks.localOcr ? "Worker dan WebAssembly didukung" : "Gunakan input manual di browser ini" },
    { label: "Pemrosesan foto", ok: checks.imageProcessing, detail: checks.imageProcessing ? "Kompresi aman didukung" : "Server OCR akan dilewati" },
    { label: "Akses kamera", ok: checks.camera, detail: checks.camera ? "Didukung bila izin diberikan" : "Pilih foto dari galeri" },
    { label: "Penyimpanan draft", ok: checks.draftStorage, detail: checks.draftStorage ? "JSON lokal tersedia" : "Draft tidak akan tersimpan" },
    { label: "Mode aplikasi", ok: true, detail: checks.installed ? "Terpasang sebagai PWA" : "Berjalan di browser" },
  ] : [];

  return (
    <div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <section className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
        <div className="flex items-center justify-between gap-4 border-b border-line p-5">
          <div><h2 className="font-extrabold">Pemeriksaan perangkat</h2><p className="mt-1 text-xs text-muted">Tidak meminta izin kamera dan tidak mengirim foto.</p></div>
          <Button variant="secondary" size="small" disabled={checking} onClick={() => void runChecks()}><RefreshCw className={checking ? "animate-spin" : ""} aria-hidden="true" size={16} /> Periksa ulang</Button>
        </div>
        <ul className="divide-y divide-line">
          {rows.map((row) => (
            <li key={row.label} className="flex items-start gap-3 px-5 py-4">
              {row.ok ? <CheckCircle2 className="mt-0.5 shrink-0 text-success" aria-hidden="true" size={20} /> : <AlertTriangle className="mt-0.5 shrink-0 text-warning" aria-hidden="true" size={20} />}
              <div><p className="text-sm font-extrabold">{row.label}</p><p className="mt-0.5 text-xs leading-5 text-muted">{row.detail}</p></div>
            </li>
          ))}
          {!checks && <li className="px-5 py-8 text-center text-sm font-bold text-muted">Memeriksa kemampuan browser…</li>}
        </ul>
      </section>

      <aside className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
        <span className="grid size-11 place-items-center rounded-xl bg-brand/8 text-brand">{server?.enabled ? <ShieldCheck aria-hidden="true" size={22} /> : <WifiOff aria-hidden="true" size={22} />}</span>
        <h2 className="mt-4 text-lg font-extrabold">Pemindai pintar</h2>
        <p className="mt-2 text-sm leading-6 text-muted">{checking ? "Menghubungi layanan…" : server?.enabled ? "Layanan server aman tersedia. Bila lambat atau kuota habis, BagiYuk beralih ke OCR lokal." : "Layanan server tidak terjangkau. OCR lokal dan input manual tetap dapat digunakan."}</p>
        {server?.enabled && (
          <dl className="mt-4 space-y-3 border-t border-line pt-4 text-sm">
            <div className="flex justify-between gap-3"><dt className="text-muted">Batas perangkat</dt><dd className="font-extrabold">{server.limits.deviceDaily}/hari</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">Batas bulanan</dt><dd className="font-extrabold">{server.limits.deviceMonthly}/bulan</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">Ukuran upload</dt><dd className="font-extrabold">{Math.round(server.maxUploadBytes / 1024 / 1024)} MB</dd></div>
          </dl>
        )}
      </aside>
    </div>
  );
}
