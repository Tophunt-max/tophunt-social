import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator, Animated } from 'react-native';
import { ReanimatedBottomSheet } from '@/src/components/modals/ReanimatedBottomSheet';
import { AppImage } from '@/src/components/ui/AppImage';
import { emitToast } from '@/src/lib/toastBridge';
import { balancesOf, hasLiveBalance } from '@/src/lib/balances';
import { useProfile } from '@/src/hooks/useProfileData';
import { useAuth } from '@/src/hooks/useAuth';
import { newRequestId, useGiftCatalog, useMonetizationConfig, useSendGift, type GiftView } from '@/src/services/monetization';

/**
 * Pick a gift, see the exact cost, confirm, send.
 *
 * Paid in DP coin only (Diamonds are for contests). The recipient gets the gift
 * and a notification, not coins. The server re-checks the price, the balance
 * and the recipient; this sheet never decides any of them.
 */
export function GiftSheet({
  visible,
  onClose,
  recipientUid,
  recipientName,
}: {
  visible: boolean;
  onClose: () => void;
  recipientUid: string;
  recipientName: string;
}) {
  const cfg = useMonetizationConfig();
  const { user } = useAuth();
  const catalog = useGiftCatalog(visible && cfg.gifts.enabled);
  const { data: me, refetch: refetchMe } = useProfile(visible ? user?.uid || '' : '');
  const send = useSendGift();
  const [selected, setSelected] = useState<GiftView | null>(null);
  const [qty, setQty] = useState(1);
  const [confirming, setConfirming] = useState(false);
  // One id per confirmed send, reused if that send is retried.
  const requestId = useRef<string | null>(null);
  const [burst, setBurst] = useState<string | null>(null);
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      setSelected(null);
      setQty(1);
      setConfirming(false);
      requestId.current = null;
    }
  }, [visible]);

  const total = selected ? selected.priceCoins * qty : 0;
  const bal = balancesOf(me as any);
  const live = hasLiveBalance(me);
  // Gifts are paid in DP coin only; Diamonds are for contest entry.
  const available = bal.dpcoin;
  const maxQty = Math.max(1, Math.min(cfg.gifts.maxQuantity, selected ? Math.floor(cfg.gifts.maxCoinsPerSend / selected.priceCoins) || 1 : 1));

  const choose = (g: GiftView) => {
    setSelected(g);
    setQty(1);
    setConfirming(false);
    requestId.current = null;
  };

  const doSend = () => {
    if (!selected) return;
    if (!requestId.current) requestId.current = newRequestId();
    send.mutate(
      { recipientUid, gift: selected, quantity: qty, requestId: requestId.current },
      {
        onSuccess: (r) => {
          requestId.current = null;
          setConfirming(false);
          setBurst(selected.asset?.emoji || '🎁');
          anim.setValue(0);
          Animated.timing(anim, { toValue: 1, duration: 900, useNativeDriver: true }).start(() => setBurst(null));
          emitToast(`Sent ${r.gift.quantity > 1 ? `${r.gift.quantity} × ` : ''}${r.gift.giftName} to ${recipientName}`, 'success');
          void refetchMe();
        },
        onError: (e: any) => {
          const reason = e?.reason;
          // A changed price or catalogue: refresh and make the user confirm again.
          if (reason === 'price_changed' || reason === 'gift_unavailable') {
            requestId.current = null;
            setConfirming(false);
            void catalog.refetch();
          }
          // The server answered: a new tap is a new send. A network failure keeps
          // the id so the retry is de-duplicated by the server.
          if (e?.status) requestId.current = null;
          emitToast(e?.message || 'Gift could not be sent. Please try again.', 'error');
        },
      },
    );
  };

  const gifts = catalog.data ?? [];
  const content = useMemo(() => {
    if (!cfg.gifts.enabled) return <Text style={styles.muted}>Gifts are not available right now.</Text>;
    if (catalog.isLoading) return <ActivityIndicator color="#FF4D67" style={{ marginVertical: 30 }} />;
    if (catalog.isError) {
      return (
        <TouchableOpacity onPress={() => catalog.refetch()} accessibilityRole="button" style={{ padding: 20 }}>
          <Text style={styles.muted}>Gifts could not load. Tap to retry.</Text>
        </TouchableOpacity>
      );
    }
    if (!gifts.length) return <Text style={styles.muted}>No gifts available right now.</Text>;
    return null;
  }, [cfg.gifts.enabled, catalog, gifts.length]);

  return (
    <ReanimatedBottomSheet visible={visible} onClose={onClose} title={`Send a gift to ${recipientName}`}>
      {content ?? (
        <View>
          <FlatList
            data={gifts}
            keyExtractor={(g) => g.id}
            numColumns={4}
            scrollEnabled={false}
            renderItem={({ item }) => {
              const active = selected?.id === item.id;
              return (
                <TouchableOpacity
                  style={[styles.gift, active && styles.giftActive]}
                  onPress={() => choose(item)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`${item.name}, ${item.priceCoins} DP coin`}
                >
                  {item.asset?.imageUrl ? (
                    <AppImage source={{ uri: item.asset.imageUrl }} style={styles.giftImg} contentFit="contain" />
                  ) : (
                    <Text style={styles.emoji}>{item.asset?.emoji || '🎁'}</Text>
                  )}
                  <Text style={styles.giftName} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.price}>{item.priceCoins} DP coin</Text>
                </TouchableOpacity>
              );
            }}
          />

          <View style={styles.footer}>
            <Text style={styles.balance}>
              Balance: {live ? `${bal.dpcoin} DP coin` : '—'}
            </Text>
            {selected && (
              <View style={styles.qtyRow}>
                <Text style={styles.label}>Quantity</Text>
                <View style={styles.stepper}>
                  <TouchableOpacity onPress={() => { setQty((q) => Math.max(1, q - 1)); requestId.current = null; }} accessibilityLabel="Fewer" style={styles.stepBtn}><Text style={styles.stepTxt}>−</Text></TouchableOpacity>
                  <Text style={styles.qty}>{qty}</Text>
                  <TouchableOpacity onPress={() => { setQty((q) => Math.min(maxQty, q + 1)); requestId.current = null; }} accessibilityLabel="More" style={styles.stepBtn}><Text style={styles.stepTxt}>+</Text></TouchableOpacity>
                </View>
              </View>
            )}
            {selected && confirming ? (
              <View style={styles.confirm}>
                <Text style={styles.confirmText}>
                  Send {qty > 1 ? `${qty} × ` : ''}{selected.name} for {total} DP coin?
                </Text>
                <Text style={styles.muted}>
                  Paid in DP coin. {recipientName} gets the gift, not coins. Gifts can&apos;t be undone.
                </Text>
                <View style={styles.row}>
                  <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={() => setConfirming(false)} disabled={send.isPending}>
                    <Text style={styles.btnGhostText}>Back</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.btn} onPress={doSend} disabled={send.isPending} accessibilityRole="button">
                    {send.isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Send</Text>}
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.btn, (!selected || (live && total > available)) && { opacity: 0.5 }]}
                disabled={!selected || (live && total > available)}
                onPress={() => setConfirming(true)}
                accessibilityRole="button"
              >
                <Text style={styles.btnText}>
                  {!selected ? 'Choose a gift' : live && total > available ? 'Not enough DP coin' : `Continue · ${total} DP coin`}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
      {burst && (
        <Animated.Text
          pointerEvents="none"
          style={[
            styles.burst,
            { opacity: anim.interpolate({ inputRange: [0, 0.8, 1], outputRange: [1, 1, 0] }), transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [0, -160] }) }, { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.8] }) }] },
          ]}
        >
          {burst}
        </Animated.Text>
      )}
    </ReanimatedBottomSheet>
  );
}

const styles = StyleSheet.create({
  gift: { flex: 1, alignItems: 'center', paddingVertical: 10, margin: 4, borderRadius: 14, borderWidth: 1, borderColor: '#F0F0F3' },
  giftActive: { borderColor: '#FF4D67', backgroundColor: '#FFF1F3' },
  giftImg: { width: 40, height: 40 },
  emoji: { fontSize: 32 },
  giftName: { fontFamily: 'Urbanist-Bold', fontSize: 12, marginTop: 4, color: '#111' },
  price: { fontFamily: 'Urbanist-Medium', fontSize: 11, color: '#6B7280' },
  footer: { paddingTop: 12, gap: 10 },
  balance: { fontFamily: 'Urbanist-Medium', fontSize: 12, color: '#6B7280' },
  qtyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { fontFamily: 'Urbanist-Bold', fontSize: 14, color: '#111' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  stepTxt: { fontSize: 18, fontFamily: 'Urbanist-Bold', color: '#111' },
  qty: { fontFamily: 'Urbanist-Bold', fontSize: 16, minWidth: 24, textAlign: 'center', color: '#111' },
  confirm: { gap: 8, backgroundColor: '#F9FAFB', padding: 12, borderRadius: 14 },
  confirmText: { fontFamily: 'Urbanist-Bold', fontSize: 15, color: '#111' },
  muted: { fontFamily: 'Urbanist-Medium', fontSize: 12, color: '#6B7280', textAlign: 'center' },
  row: { flexDirection: 'row', gap: 10 },
  btn: { flex: 1, backgroundColor: '#FF4D67', borderRadius: 14, paddingVertical: 13, alignItems: 'center' },
  btnText: { color: '#fff', fontFamily: 'Urbanist-Bold', fontSize: 15 },
  btnGhost: { backgroundColor: '#F3F4F6' },
  btnGhostText: { color: '#111', fontFamily: 'Urbanist-Bold', fontSize: 15 },
  burst: { position: 'absolute', alignSelf: 'center', bottom: 120, fontSize: 64 },
});
