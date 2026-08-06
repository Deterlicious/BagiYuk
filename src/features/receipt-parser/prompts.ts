export const RECEIPT_PARSE_PROMPT = `Baca seluruh foto struk restoran ini dari atas sampai bawah dan kembalikan JSON saja, tanpa markdown atau penjelasan.

Struk kemungkinan berbahasa Indonesia. Pertahankan nama item seperti tercetak dan jangan melewatkan baris item, termasuk pada struk yang panjang. Baca pemisah angka Indonesia dengan hati-hati: titik atau koma pada harga biasanya pemisah ribuan, bukan desimal. Semua uang harus berupa integer rupiah tanpa simbol atau pemisah.

Satu angka di paling kiri biasanya quantity dan satu angka di paling kanan biasanya lineTotal. Jika unitPrice tidak dicetak, isi unitPrice dengan lineTotal dibagi quantity hanya jika pembagiannya tepat. Abaikan nomor meja, nomor transaksi, jumlah total item, jumlah total quantity, tanggal, dan metadata kasir sebagai item.

Jangan menebak teks atau angka yang tidak terbaca. Gunakan null untuk field yang tidak yakin. Diskon dikembalikan sebagai nilai positif. Pembulatan boleh negatif. Jangan menghitung pembagian tagihan atau pemilik item.

Gunakan struktur tepat ini:
{
  "merchantName": string | null,
  "items": [
    {
      "name": string | null,
      "quantity": integer | null,
      "unitPrice": integer | null,
      "lineTotal": integer | null
    }
  ],
  "summary": {
    "subtotal": integer | null,
    "tax": integer | null,
    "serviceCharge": integer | null,
    "discount": integer | null,
    "rounding": integer | null,
    "total": integer | null
  }
}`;

const nullableInteger = { type: ["integer", "null"] } as const;
const nullableString = { type: ["string", "null"] } as const;

export const RECEIPT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    merchantName: nullableString,
    items: {
      type: "array",
      minItems: 1,
      maxItems: 100,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: nullableString,
          quantity: nullableInteger,
          unitPrice: nullableInteger,
          lineTotal: nullableInteger,
        },
        required: ["name", "quantity", "unitPrice", "lineTotal"],
      },
    },
    summary: {
      type: "object",
      additionalProperties: false,
      properties: {
        subtotal: nullableInteger,
        tax: nullableInteger,
        serviceCharge: nullableInteger,
        discount: nullableInteger,
        rounding: nullableInteger,
        total: nullableInteger,
      },
      required: ["subtotal", "tax", "serviceCharge", "discount", "rounding", "total"],
    },
  },
  required: ["merchantName", "items", "summary"],
} as const;
