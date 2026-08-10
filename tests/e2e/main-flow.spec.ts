import { expect, test } from "@playwright/test";

test("complete sample bill split, copy, return, and reset", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Bagi tagihan tanpa hitung ulang." })).toBeVisible();
  await page.getByRole("link", { name: "Coba data contoh" }).click();
  await expect(page.getByText("Langkah 2 dari 5")).toBeVisible();

  const firstItemName = page.getByLabel("Nama item", { exact: true }).first();
  await firstItemName.fill("Nasi Goreng Kampung pedas");
  await page.getByRole("button", { name: "Lanjut ke anggota" }).click();

  const participantInput = page.getByLabel("Nama anggota", { exact: true });
  for (const participant of ["Ayu", "Bima", "Citra"]) {
    await participantInput.fill(participant);
    await page.getByRole("button", { name: "Tambahkan" }).click();
  }
  await expect(page.getByText("3 orang", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Pilih pesanan" }).click();

  const itemCards = page.getByRole("article");
  await itemCards.nth(0).getByText("Ayu", { exact: true }).click();
  await itemCards.nth(1).getByRole("button", { name: "Pilih semua" }).click();
  await itemCards.nth(2).getByText("Bima", { exact: true }).click();
  await itemCards.nth(3).getByText("Citra", { exact: true }).click();

  await expect(page.getByText("4 dari 4 item")).toBeVisible();
  await page.getByRole("button", { name: "Lihat hasil" }).click();
  await expect(page.getByText("Total cocok sampai rupiah terakhir")).toBeVisible();
  await expect(page.getByText(/Rp\s*111\.000/).first()).toBeVisible();

  await page.getByRole("button", { name: "Salin ringkasan" }).click();
  await expect(page.getByText("Ringkasan berhasil disalin.")).toBeVisible();

  await page.getByRole("button", { name: "Ubah pembagian" }).click();
  await expect(page.getByRole("heading", { name: "Siapa memesan apa?" })).toBeVisible();
  await expect(page.getByRole("article").nth(0).getByRole("checkbox", { name: "Ayu", exact: true })).toBeChecked();

  await page.getByRole("button", { name: "Mulai ulang" }).first().click();
  await page.getByRole("button", { name: "Ya, mulai ulang" }).click();
  await expect(page.getByRole("heading", { name: "Mulai dari foto atau isi sendiri." })).toBeVisible();
});

test("verification remains usable with 200% text sizing", async ({ page }) => {
  await page.goto("/split/new?sample=1");
  await page.getByText("Langkah 2 dari 5").waitFor();
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });

  await expect(page.getByRole("heading", { name: "Pastikan item dan angka sudah benar." })).toBeVisible();
  await page.getByRole("button", { name: "Lanjut ke anggota" }).scrollIntoViewIfNeeded();
  await expect(page.getByRole("button", { name: "Lanjut ke anggota" })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test("starting a new split clears a previously opened sample", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Coba data contoh" }).click();
  await expect(page.getByText("Langkah 2 dari 5")).toBeVisible();
  await page.getByRole("link", { name: "Kembali ke beranda" }).click();
  await page.getByRole("link", { name: "Mulai bagi tagihan" }).click();

  await expect(page.getByText("Langkah 1 dari 5")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Mulai dari foto atau isi sendiri." })).toBeVisible();
  await expect(page.getByLabel("Nama item", { exact: true })).toHaveCount(0);
});

test("upload validation always tells the user what happened", async ({ page }) => {
  await page.goto("/split/new?fresh=1");
  await expect(page.getByRole("heading", { name: "Mulai dari foto atau isi sendiri." })).toBeVisible();

  await page.locator('input[type="file"]').nth(1).setInputFiles({
    name: "bukan-struk.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("not an image"),
  });

  await expect(
    page.getByRole("alert").filter({ hasText: "Gunakan foto JPG, PNG, atau WebP." }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Pilih foto lain" })).toBeVisible();
});

test("professional shortcuts, individual share, and help remain accessible", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/split/new?sample=1");
  await page.getByRole("button", { name: "Lanjut ke anggota" }).click();

  const participantInput = page.getByLabel("Nama anggota", { exact: true });
  for (const participant of ["Ayu", "Bima"]) {
    await participantInput.fill(participant);
    await page.getByRole("button", { name: "Tambahkan" }).click();
  }
  await page.getByRole("button", { name: "Duplikat Ayu" }).click();
  await expect(page.locator('input[value="Ayu 2"]')).toBeVisible();
  await page.getByRole("button", { name: "Pilih pesanan" }).click();

  await page.getByRole("button", { name: "Bagi semua ke semua" }).click();
  await expect(page.getByText("4 dari 4 item")).toBeVisible();
  await expect(page.getByText("Subtotal sementara per orang")).toBeVisible();
  await page.getByRole("button", { name: "Lihat hasil" }).click();

  await page.getByRole("button", { name: "Salin pesan untuk Ayu", exact: true }).click();
  await expect(page.getByText("Pesan untuk Ayu berhasil disalin.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Unduh gambar" })).toBeVisible();

  await page.goto("/bantuan");
  await expect(page.getByRole("heading", { name: "Hasil yang akurat dimulai dari pemeriksaan yang jelas." })).toBeVisible();
  await expect(page.getByText("Privasi struk", { exact: true })).toBeVisible();
});

test("server quota explains the local fallback without blocking manual recovery", async ({ page }) => {
  await page.route("**/api/receipts/parse", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          enabled: true,
          turnstileSiteKey: "test-site-key",
          limits: {
            deviceDaily: 3,
            deviceMonthly: 20,
            networkDaily: 10,
            networkMonthly: 50,
            globalMonthly: 800,
          },
          maxUploadBytes: 4 * 1024 * 1024,
        }),
      });
      return;
    }
    await route.fulfill({
      status: 429,
      contentType: "application/json",
      headers: { "retry-after": "60" },
      body: JSON.stringify({
        error: { code: "quota_device_daily", message: "Kuota pemindai pintar sudah habis." },
      }),
    });
  });
  await page.route("**/turnstile/v0/api.js**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/javascript",
      body: `window.turnstile={render:function(el,o){setTimeout(function(){o.callback('test-token')},0);return 'widget'},remove:function(){}};`,
    }),
  );

  await page.goto("/split/new?fresh=1");
  await expect(page.getByText(/maksimal 3 scan per hari/)).toBeVisible();
  await page.locator('input[type="file"]').nth(1).setInputFiles({
    name: "receipt.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    ),
  });

  await expect(page.getByText("Beralih ke perangkat", { exact: true })).toBeVisible();
  await expect(page.getByText(/Kuota pemindai pintar habis/)).toBeVisible();
  await page.getByRole("button", { name: "Batalkan scan" }).click();
  await expect(page.getByRole("button", { name: "Masukkan manual" })).toBeVisible();
});
