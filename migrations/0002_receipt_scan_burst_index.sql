CREATE INDEX IF NOT EXISTS receipt_scan_device_created_at
  ON receipt_scan_reservations (device_hash, created_at);
