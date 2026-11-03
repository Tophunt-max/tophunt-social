-- Compare-at ("original") price for physical shop products (lib/shop.ts).
--
-- Display only: checkout always charges the DP coin price derived from
-- price_inr_paise + shipping_inr_paise. When set it must be above
-- price_inr_paise (validateProductInput, whole rupees). The app shows the real
-- discount ("-20%", strike-through original); the coin value is computed with
-- the same conversion as the price (unitCoins, delivery included), so the
-- percent matches what the user sees. NULL = no discount.
-- Paise, like the other money columns of shop_products (migration 0073).
ALTER TABLE shop_products ADD COLUMN compare_at_inr_paise INTEGER;
