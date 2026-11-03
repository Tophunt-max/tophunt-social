-- Compare-at ("original") price for digital store listings (lib/store.ts).
--
-- Display only: the price charged is always price_coins. When set it must be
-- above price_coins (validateListingInput); the app then shows the real
-- discount ("-20%", strike-through original) and the home "Mega Shop Deal".
-- NULL = no discount.
ALTER TABLE store_listings ADD COLUMN compare_at_coins INTEGER;
