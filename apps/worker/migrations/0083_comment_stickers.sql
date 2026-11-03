-- Stickers in comments (lib/stickers.ts).
--
-- A comment may carry one owned sticker (reward_catalog type='sticker'), with or
-- without text. The id is kept even if the item is later turned off, so old
-- threads keep drawing what was sent. NULL = a plain text comment.
-- DM stickers need no column: a ChatArchive row of type 'sticker' keeps the
-- item id in media_url.
ALTER TABLE post_comments ADD COLUMN sticker_id TEXT;
ALTER TABLE match_comments ADD COLUMN sticker_id TEXT;
ALTER TABLE blog_comments ADD COLUMN sticker_id TEXT;
