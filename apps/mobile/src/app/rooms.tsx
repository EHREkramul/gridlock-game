import { MAX_PLAYERS, MIN_PLAYERS } from '@gridlock/engine';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Banner, Button, Chip, Header, Screen, T, tap } from '@/components/ui';
import { describeTable } from '@/lib/format';
import { fetchPublicRooms, session, useSession } from '@/lib/session';
import { colors, playerColor, radius, space } from '@/lib/theme';

type RoomRow = Awaited<ReturnType<typeof fetchPublicRooms>>[number];

const FILTERS = [0, ...Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, i) => MIN_PLAYERS + i)];

export default function Rooms() {
  const [filter, setFilter] = useState(0);
  const [rooms, setRooms] = useState<RoomRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [joining, setJoining] = useState<string | null>(null);
  const { error } = useSession();

  const load = useCallback(async () => {
    try {
      setRooms(await fetchPublicRooms(filter || undefined));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [filter]);

  // poll while the screen is visible
  useFocusEffect(
    useCallback(() => {
      load();
      const id = setInterval(load, 3000);
      return () => clearInterval(id);
    }, [load]),
  );

  const join = async (roomId: string) => {
    setJoining(roomId);
    const ok = await session.joinByCode(roomId);
    setJoining(null);
    if (ok) router.replace('/game');
    else load();
  };

  return (
    <Screen>
      <Header title="Open tables" />
      <View style={styles.filters}>
        {FILTERS.map((n) => (
          <Chip
            key={n}
            label={n === 0 ? 'All' : `${n}`}
            selected={filter === n}
            color={n ? playerColor(n - 1) : colors.primary}
            onPress={() => {
              setRooms(null);
              setFilter(n);
            }}
            style={styles.filterChip}
          />
        ))}
      </View>
      {error ? (
        <View style={{ paddingHorizontal: space.xl }}>
          <Banner text={error} />
        </View>
      ) : null}
      {failed ? (
        <View style={{ paddingHorizontal: space.xl }}>
          <Banner text="Can't reach the game server right now." />
        </View>
      ) : null}
      {rooms === null && !failed ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: space.xxl }} />
      ) : (
        <FlatList
          data={rooms ?? []}
          keyExtractor={(r) => r.roomId}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              tintColor={colors.primary}
              onRefresh={async () => {
                setRefreshing(true);
                await load();
                setRefreshing(false);
              }}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <T style={{ fontSize: 44 }}>🪑</T>
              <T variant="heading" style={{ marginTop: space.md }}>
                No open tables
              </T>
              <T variant="caption" style={{ textAlign: 'center', marginTop: space.xs, marginBottom: space.xl }}>
                Start a quick match and others will find you here.
              </T>
              <Button
                title="Quick match"
                icon="⚡"
                onPress={() => router.replace({ pathname: '/setup', params: { mode: 'quick' } })}
              />
            </View>
          }
          renderItem={({ item, index }) => {
            const md = item.metadata;
            const players = md?.players ?? item.maxClients;
            return (
              <Animated.View entering={FadeInDown.delay(index * 40)}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    tap();
                    join(item.roomId);
                  }}
                  style={({ pressed }) => [
                    styles.room,
                    pressed && { transform: [{ scale: 0.98 }], borderColor: colors.borderHi },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <T variant="label">{md?.host ? `${md.host}'s table` : 'Open table'}</T>
                    <T variant="caption">{describeTable(players, md?.time ?? 5, md?.walls ?? 0)}</T>
                  </View>
                  <View style={styles.seats}>
                    {Array.from({ length: players }, (_, i) => (
                      <View
                        key={i}
                        style={[
                          styles.seat,
                          i < item.clients
                            ? { backgroundColor: playerColor(i) }
                            : { borderWidth: 1.5, borderColor: playerColor(i) },
                        ]}
                      />
                    ))}
                  </View>
                  {joining === item.roomId ? <ActivityIndicator color={colors.primary} /> : <T variant="heading">›</T>}
                </Pressable>
              </Animated.View>
            );
          }}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  filters: { flexDirection: 'row', gap: space.sm, paddingHorizontal: space.xl, paddingBottom: space.md },
  filterChip: { flex: 1, minHeight: 40, paddingHorizontal: 0 },
  list: { paddingHorizontal: space.xl, paddingBottom: space.xxl, gap: space.sm, flexGrow: 1 },
  room: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
  },
  seats: { flexDirection: 'row', gap: 4, flexWrap: 'wrap', maxWidth: 70 },
  seat: { width: 12, height: 12, borderRadius: 6 },
  empty: { alignItems: 'center', justifyContent: 'center', flex: 1, paddingTop: space.xxl * 2 },
});
