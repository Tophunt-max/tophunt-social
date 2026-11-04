/** Loading placeholder matching the item detail layout (hero, tabs, info, price card, details). */
import React from 'react';
import { View } from 'react-native';
import { Skeleton } from '@/src/components/ui/Skeleton';
import { TH } from '@/src/theme/tophunt';
import { heroStageHeight } from './ItemHero';

export function ItemSkeleton({ width }: { width: number }) {
  return (
    <View style={{ gap: 20, marginTop: 8 }} accessible accessibilityLabel="Item load ho raha hai">
      <View style={{ gap: 12 }}>
        <Skeleton width={width} height={heroStageHeight(width)} borderRadius={TH.radii.xxl} />
        <Skeleton width={width} height={50} borderRadius={TH.radii.md} />
        <Skeleton width={180} height={12} borderRadius={6} style={{ alignSelf: 'center' }} />
      </View>
      <View style={{ gap: 8 }}>
        <Skeleton width="72%" height={26} />
        <Skeleton width={140} height={14} />
        <Skeleton width="94%" height={14} />
        <Skeleton width="60%" height={14} />
      </View>
      <Skeleton width={width} height={128} borderRadius={TH.radii.lg} />
      <View style={{ gap: 10 }}>
        <Skeleton width={120} height={18} />
        <Skeleton width={width} height={210} borderRadius={TH.radii.lg} />
      </View>
    </View>
  );
}
