export const RECEIPT_PARSE_PROMPT = `Baca foto struk restoran ini dan kembalikan JSON saja, tanpa markdown atau penjelasan.

Struk kemungkinan berbahasa Indonesia. Pertahankan nama item seperti tercetak. Baca pemisah angka Indonesia dengan hati-hati: titik atau koma pada harga biasanya pemisah ribuan, bukan desimal. Semua uang harus berupa integer rupiah tanpa simbol atau pemisah.

Jangan menebak teks atau angka yang tidak terbaca. Gunakan null untuk value yang tidak yakin dan beri confidence antara 0 dan 1 untuk setiap field. Diskon dikembalikan sebagai nilai positif. Pembulatan boleh negatif. Jangan menghitung pembagian tagihan atau pemilik item.

Gunakan struktur tepat ini:
{
  "merchantName": { "value": string | null, "confidence": number },
  "items": [
    {
      "name": { "value": string | null, "confidence": number },
      "quantity": { "value": integer | null, "confidence": number },
      "unitPrice": { "value": integer | null, "confidence": number },
      "lineTotal": { "value": integer | null, "confidence": number }
    }
  ],
  "summary": {
    "subtotal": { "value": integer | null, "confidence": number },
    "tax": { "value": integer | null, "confidence": number },
    "serviceCharge": { "value": integer | null, "confidence": number },
    "discount": { "value": integer | null, "confidence": number },
    "rounding": { "value": integer | null, "confidence": number },
    "total": { "value": integer | null, "confidence": number }
  }
}`;
