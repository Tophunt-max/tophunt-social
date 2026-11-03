/**
 * The equipped `effect` cosmetic (users.cosmetics.effect, from resolveCosmetics)
 * drawn around the profile avatar.
 *
 *  - With artwork (uploaded WebP or bundled): the art over the avatar, its
 *    overlay animated with the item's motion; a single image animates itself.
 *  - Without artwork (colour-only items like effect_legend_burst): a pulsing
 *    halo in the item's colours.
 *
 * Purely decorative: no touches, static under reduced motion / off-screen
 * (CosmeticFx), and nothing at all when no effect is equipped.
 */
import React, { type FC } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop, type SvgProps } from 'react-native-svg';
import { cosmeticArt } from '@/src/lib/cosmeticArt';
import { assetColors } from '@/src/lib/progression';
import { CosmeticArtGraphic } from './CosmeticGraphic';
import { CosmeticFx, type MotionLevel } from './CosmeticFx';

type EffectItem = { id: string; name: string; rarity?: string | null; asset?: Record<string, any> | null } | null | undefined;

/** Effect box relative to the avatar it surrounds. */
export const EFFECT_SCALE = 1.5;

function haloOf(c0: string, c1: string): FC<SvgProps> {
  const Halo: FC<SvgProps> = (props) => (
    <Svg viewBox="0 0 100 100" {...props}>
      <Defs>
        <RadialGradient id="fxHalo" cx="50" cy="50" r="50" gradientUnits="userSpaceOnUse">
          <Stop offset="0.62" stopColor={c0} stopOpacity="0" />
          <Stop offset="0.72" stopColor={c0} stopOpacity="0.55" />
          <Stop offset="0.86" stopColor={c1} stopOpacity="0.35" />
          <Stop offset="1" stopColor={c1} stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Circle cx="50" cy="50" r="50" fill="url(#fxHalo)" />
    </Svg>
  );
  return Halo;
}

export function ProfileEffect({ effect, avatarSize, motion = 'full' }: { effect: EffectItem; avatarSize: number; motion?: MotionLevel }) {
  const art = effect ? cosmeticArt({ ...effect, type: 'effect' }, 'effect') : null;
  const [c0, c1] = assetColors(effect?.asset, ['#FFD740', '#FF5252']);
  const Halo = React.useMemo(() => haloOf(c0, c1), [c0, c1]);
  if (!effect) return null;
  const box = Math.round(avatarSize * EFFECT_SCALE);
  const offset = -(box - avatarSize) / 2;
  return (
    <View
      pointerEvents="none"
      accessible
      accessibilityLabel={`Profile effect: ${effect.name}`}
      style={[styles.box, { width: box, height: box, left: offset, top: offset }]}
    >
      {art ? (
        art.Fx ? (
          <>
            <CosmeticArtGraphic art={art} width={box} height={box} />
            <CosmeticFx Fx={art.Fx} fx={art.fx} width={box} height={box} motion={motion} />
          </>
        ) : (
          <CosmeticFx Fx={(art.Art ?? art.source)!} fx={art.fx ?? 'pulse'} width={box} height={box} motion={motion} />
        )
      ) : (
        <CosmeticFx Fx={Halo} fx="pulse" width={box} height={box} motion={motion} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
});
