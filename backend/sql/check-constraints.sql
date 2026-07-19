-- techBuilder — money/quantity CHECK constraints (defense-in-depth). Idempotent (safe to re-run).
-- Applied alongside rls.sql/auth.sql via `npm run db:constraints` (and the combined db:deploy step).
--
-- WHY a DB-level backstop when the zod schemas already gate amounts: the SYNC push path
-- (backend/src/sync/sync.service.ts) does NOT run the controller zod schemas — it inserts the
-- offline payload directly. These CHECKs are the only thing that stops a negative/zero amount or
-- litre arriving through sync (or any future writer that skips the controller). Paise are integer
-- money; a negative expense would deflate the khata balance, a negative litre would corrupt diesel
-- stock (= purchases − issuances). fuel_logs.amount_paise is nullable by design (diesel from
-- store/khata = no money paid) so its CHECK allows NULL.

DO $$
BEGIN
  -- amount_paise > 0 on the four money tables
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expenses_amount_positive') THEN
    ALTER TABLE expenses ADD CONSTRAINT expenses_amount_positive CHECK (amount_paise > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cash_transfers_amount_positive') THEN
    ALTER TABLE cash_transfers ADD CONSTRAINT cash_transfers_amount_positive CHECK (amount_paise > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vendor_payments_amount_positive') THEN
    ALTER TABLE vendor_payments ADD CONSTRAINT vendor_payments_amount_positive CHECK (amount_paise > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'advances_amount_positive') THEN
    ALTER TABLE advances ADD CONSTRAINT advances_amount_positive CHECK (amount_paise > 0);
  END IF;

  -- fuel amount is nullable (from store/khata); when present it must be positive
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fuel_logs_amount_positive') THEN
    ALTER TABLE fuel_logs ADD CONSTRAINT fuel_logs_amount_positive CHECK (amount_paise IS NULL OR amount_paise > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fuel_stock_purchases_amount_positive') THEN
    ALTER TABLE fuel_stock_purchases ADD CONSTRAINT fuel_stock_purchases_amount_positive CHECK (amount_paise IS NULL OR amount_paise > 0);
  END IF;

  -- litres > 0 on every diesel table
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fuel_logs_litres_positive') THEN
    ALTER TABLE fuel_logs ADD CONSTRAINT fuel_logs_litres_positive CHECK (litres > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fuel_stock_purchases_litres_positive') THEN
    ALTER TABLE fuel_stock_purchases ADD CONSTRAINT fuel_stock_purchases_litres_positive CHECK (litres > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fuel_issuances_litres_positive') THEN
    ALTER TABLE fuel_issuances ADD CONSTRAINT fuel_issuances_litres_positive CHECK (litres > 0);
  END IF;

  -- material quantity > 0
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'material_txns_qty_positive') THEN
    ALTER TABLE material_txns ADD CONSTRAINT material_txns_qty_positive CHECK (qty > 0);
  END IF;
END
$$;
