# CORD receipt benchmark

Evaluation date: 10 August 2026

## Dataset

BagiYuk uses the CC-BY-4.0 [Voxel51 CORD mirror](https://huggingface.co/datasets/Voxel51/consolidated_receipt_dataset) at immutable revision `a468aad0427a88453151d968c2f175299d9e0ba6`. CORD contains real Indonesian shop and restaurant receipts with manually verified OCR boxes, semantic labels, item grouping, and receipt totals.

The full mirror is about 1.3 GB. BagiYuk does not vendor it. `pnpm benchmark:cord:fetch` caches only the 5.7 MB annotation file and eight deterministic images under ignored `.cache/cord` paths.

## Evaluation layers

### Post-OCR parser

`pnpm benchmark:cord` converts all 800 annotated text boxes and normalized coordinates into the same untrusted `OcrLine` boundary used by production. It then compares BagiYuk output against semantic menu groups and summary fields.

| Metric | Result |
| --- | ---: |
| Parse success | 99.00% |
| Exact line-item count | 71.88% |
| Mean absolute line-item error | 0.51 rows |
| Exact printed subtotal | 78.71% |
| Exact tax | 82.18% |
| Exact service charge | 76.53% |
| Exact receipt total | 85.77% |
| Exact core receipt (rows and available summaries) | 61.13% |

The `num_items` mirror field often represents total quantity rather than the number of menu rows, so row accuracy uses unique semantic `menu.*` group identifiers. Quantity-total accuracy is reported separately in the generated JSON and is currently 27.63%; it is not used to overstate line-item accuracy.

The machine-readable report is generated at `.cache/cord/parser-report.json` with up to 40 representative mismatches.

### Browser OCR subset

Eight images cover long restaurant tables, bakery layouts, item discounts, zero-price rows, decimal-formatted prices, barcodes, and separate name/price rows. Every image was uploaded through the real mobile-first UI and processed locally by PP-OCRv6 with the adaptive contrast pass.

| Image | Result |
| --- | --- |
| 000000 | Completed; 19/22 rows, printed summary not trusted, clear mandatory-review warning |
| 000003 | 3/3 rows; subtotal, discount-adjusted total, tax, and service exact |
| 000014 | Positive-value item and total found; item name poor and zero-price bag omitted |
| 000020 | Only 1/5 rows; per-item discount layout requires manual correction |
| 000055 | 1/1 row; subtotal, tax, and total exact |
| 000064 | OCR text detected but no safe item structure; manual fallback shown |
| 000068 | 4/4 rows and total exact after decimal `.00` normalization; one name incomplete |
| 000076 | 1/1 semantic menu row; subtotal, tax, and total exact |

Observed subset rates are 7/8 successful structured scans, 4/8 exact semantic row counts, and 6/8 exact receipt totals. This small stratified subset is a diagnostic check, not a statistically representative OCR accuracy claim.

## Improvements found through CORD

- Added name–quantity–price, name–price, unit-price × quantity, and standalone-price row layouts.
- Recognized hyphenated `Sub-Total`, item-count footers, and common payment/category rollups without turning them into menu items.
- Added `Rp`/`IDR` and `.00`/`,00` normalization while preserving integer rupiah.
- Prevented inferred subtotals from being displayed as successful printed reconciliation.
- Triggered the enhancement pass when printed subtotal or total remains untrusted.

## Limitations

CORD's annotation benchmark isolates post-OCR parsing and therefore does not measure recognition errors. The eight-image browser subset does exercise recognition, but remains intentionally small. CORD is from 2019 and does not cover every current Indonesian POS layout. OCR output remains editable and the manual workflow remains the required fallback.
