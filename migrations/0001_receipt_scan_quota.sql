CREATE TABLE IF NOT EXISTS receipt_scan_reservations (
  id TEXT PRIMARY KEY,
  device_hash TEXT NOT NULL,
  network_hash TEXT NOT NULL,
  day_key TEXT NOT NULL,
  month_key TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS receipt_scan_device_day
  ON receipt_scan_reservations (device_hash, day_key);
CREATE INDEX IF NOT EXISTS receipt_scan_device_month
  ON receipt_scan_reservations (device_hash, month_key);
CREATE INDEX IF NOT EXISTS receipt_scan_network_day
  ON receipt_scan_reservations (network_hash, day_key);
CREATE INDEX IF NOT EXISTS receipt_scan_network_month
  ON receipt_scan_reservations (network_hash, month_key);
CREATE INDEX IF NOT EXISTS receipt_scan_global_month
  ON receipt_scan_reservations (month_key);
CREATE INDEX IF NOT EXISTS receipt_scan_created_at
  ON receipt_scan_reservations (created_at);
