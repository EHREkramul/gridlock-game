import { View } from 'react-native';
import { alpha, colors } from '@/lib/theme';

/** 3×3 grid mark with a wall cutting across it. */
export function Logo({ size = 32 }: { size?: number }) {
  const cell = size / 3.6;
  const gap = (size - cell * 3) / 2;
  return (
    <View style={{ width: size, height: size }}>
      {Array.from({ length: 9 }, (_, i) => {
        const x = i % 3;
        const y = Math.floor(i / 3);
        const hot = i === 7;
        return (
          <View
            key={i}
            style={{
              position: 'absolute',
              left: x * (cell + gap),
              top: y * (cell + gap),
              width: cell,
              height: cell,
              borderRadius: cell * 0.3,
              backgroundColor: hot ? colors.primary : alpha(colors.text, 0.22),
            }}
          />
        );
      })}
      <View
        style={{
          position: 'absolute',
          left: 0,
          top: cell + gap * 0.15 + (cell + gap),
          width: cell * 2 + gap,
          height: gap * 0.7,
          borderRadius: gap,
          backgroundColor: colors.primaryAlt,
        }}
      />
    </View>
  );
}
