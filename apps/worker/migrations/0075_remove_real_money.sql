-- TopHunt has no real money any more: Diamonds are earned free, DP coin is won
-- in contests and spent in Shopping, and nothing is bought or cashed out.
--
-- Drops the real-money tables (all empty on production when this shipped,
-- except one unused coin package, backed up first) and the settings that only
-- configured them. The coin ledger (`coin_transactions`) is kept untouched: it
-- is the audit trail and the source of every balance.
DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS payment_orders;
DROP TABLE IF EXISTS withdrawals;
DROP TABLE IF EXISTS deposits;
DROP TABLE IF EXISTS coin_packages;

-- Reservations for checkouts / deposits that can no longer exist.
DELETE FROM promo_reservations WHERE ref_type IN ('order', 'deposit');

-- Settings that only configured real money.
UPDATE settings
   SET data = json_remove(data,
         '$.withdrawal', '$.paymentGateway', '$.coinPricing.buyRate',
         '$.features.topups', '$.features.withdrawals', '$.referralProgram.minPurchaseInr')
 WHERE id = 'appConfig' AND json_valid(data);
UPDATE settings SET data = json_remove(data, '$.payments')
 WHERE id = 'integrations' AND json_valid(data);
DELETE FROM integration_secrets WHERE name IN ('RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET');
