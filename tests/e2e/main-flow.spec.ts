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
  await expect(itemCards.nth(0).getByLabel("Ayu")).toBeChecked();

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
