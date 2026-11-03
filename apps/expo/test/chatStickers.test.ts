import { describe, expect, it } from 'vitest';
import { fromServer, mergeThread } from '@/src/lib/chatThread';

const sticker = { id: 'party_cat', name: 'Party Cat', rarity: 'epic', asset: { imageUrl: 'https://media.tophunt.in/shop-items/a.webp' } };

describe('sticker messages', () => {
  it('maps a sticker row to a bubble-less sticker message', () => {
    const m = fromServer({ id: 'a_1', senderId: 'a', text: null, type: 'sticker', mediaUrl: null, stickerId: 'party_cat', sticker, createdAt: 1 });
    expect(m).toMatchObject({ _id: 'a_1', text: '', sticker });
    expect(m.image).toBeUndefined();
  });

  it('a sticker whose item is gone shows a text note, never an empty bubble', () => {
    const m = fromServer({ id: 'a_2', senderId: 'a', text: null, type: 'sticker', stickerId: 'gone', sticker: null, createdAt: 2 });
    expect(m.sticker).toBeUndefined();
    expect(m.text).toBe('Sticker');
  });

  it('the server copy replaces the optimistic sticker bubble (same id)', () => {
    const optimistic = [{ _id: 'a_3', text: '', sticker, createdAt: 3, user: { _id: 'a' }, pending: true }];
    const merged = mergeThread(optimistic, [{ id: 'a_3', senderId: 'a', text: null, type: 'sticker', stickerId: 'party_cat', sticker, createdAt: 3 }]);
    expect(merged).toHaveLength(1);
    expect(merged[0].pending).toBeUndefined();
    expect(merged[0].sticker?.id).toBe('party_cat');
  });
});
