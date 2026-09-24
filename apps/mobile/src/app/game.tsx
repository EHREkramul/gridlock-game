import { checkWall, EMOTES, gameStateFromSynced, type SyncedPlayer } from '@gridlock/engine';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, BackHandler, Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { Board, type InputMode } from '@/components/Board';
import { Lobby } from '@/components/Lobby';
import { PlayerChip } from '@/components/PlayerChip';
import { ResultCard } from '@/components/ResultCard';
import { Button, IconButton, notify, Screen, T, tap } from '@/components/ui';
import { describeActionError } from '@/lib/format';
import { session, useSession } from '@/lib/session';
import { alpha, colors, fonts, playerColor, radius, space } from '@/lib/theme';
import { toModelWall, viewFor, type WallPos } from '@/lib/view';

function useNow(serverOffset: number, active: boolean) {
  const [now, setNow] = useState(() => Date.now() + serverOffset);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now() + serverOffset), 250);
    return () => clearInterval(id);
  }, [serverOffset, active]);
  return now;
}

export default function GameScreen() {
  const snap = useSession();
  const { state, sessionId, status } = snap;
  const { width, height } = useWindowDimensions();
  const [mode, setMode] = useState<InputMode>('move');
  const [draft, setDraft] = useState<WallPos | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [turnKey, setTurnKey] = useState('');

  const game = useMemo(() => (state ? gameStateFromSynced(state) : null), [state]);
  const me = state?.players.find((p) => p.sessionId === sessionId) ?? null;
  const mySeat = me && game ? me.seat : null;
  const view = useMemo(() => (game ? viewFor(game.config, mySeat) : null), [game, mySeat]);
  const playing = state?.phase === 'playing';
  const myTurn = !!(playing && me && me.status === 'active' && state!.turn === me.seat && status === 'connected');
  const now = useNow(snap.serverOffset, playing || state?.phase === 'countdown');

  // reset wall drafting whenever the turn moves on (state adjusted during render,
  // see https://react.dev/learn/you-might-not-need-an-effect)
  const currentTurnKey = `${state?.round}-${state?.moveCount}-${state?.turn}`;
  if (currentTurnKey !== turnKey) {
    setTurnKey(currentTurnKey);
    setDraft(null);
    setMode('move');
  }

  useEffect(() => {
    if (myTurn) notify('success');
  }, [myTurn]);

  // rejected actions surface as a short toast
  const actionError = snap.actionError;
  useEffect(() => {
    if (!actionError) return;
    notify('error');
    const show = setTimeout(() => setToast(describeActionError(actionError.code)), 0);
    const hide = setTimeout(() => setToast(null), 2200);
    session.clearActionError();
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, [actionError]);

  const leave = useCallback(async () => {
    setConfirmLeave(false);
    await session.leave();
    router.replace('/');
  }, []);

  // Android back button: ask before abandoning a running game
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        if (state?.phase === 'playing' && me?.status === 'active') setConfirmLeave(true);
        else void leave();
        return true;
      });
      return () => sub.remove();
    }, [state?.phase, me?.status, leave]),
  );

  const draftError = useMemo(() => {
    if (!draft || !game || mySeat === null || !view) return null;
    const w = toModelWall(view, draft);
    return checkWall(game, mySeat, w.x, w.y, w.o);
  }, [draft, game, mySeat, view]);

  // ---------------------------------------------------------------- states without a board

  if (!state) {
    return (
      <Screen style={styles.center}>
        {status === 'closed' ? (
          <View style={styles.centerBox}>
            <T variant="heading">{snap.error ?? 'You left the table.'}</T>
            <Button title="Back home" onPress={() => router.replace('/')} style={{ marginTop: space.xl }} />
          </View>
        ) : (
          <View style={styles.centerBox}>
            <ActivityIndicator color={colors.primary} size="large" />
            <T variant="caption" style={{ marginTop: space.lg }}>
              Connecting to the table…
            </T>
          </View>
        )}
      </Screen>
    );
  }

  const inLobby = state.phase === 'lobby' || (state.phase === 'countdown' && state.round === 0);
  const countdown = state.phase === 'countdown' ? Math.max(1, Math.ceil((state.startsAt - now) / 1000)) : 0;

  if (inLobby || !game || !view) {
    return (
      <Screen>
        <Lobby state={state} sessionId={sessionId} onLeave={leave} />
        {state.phase === 'countdown' ? <Countdown value={countdown} /> : null}
        <ConnectionBanner status={status} error={snap.error} />
      </Screen>
    );
  }

  // ---------------------------------------------------------------- board layout

  const others = [...state.players].filter((p) => p.sessionId !== sessionId).sort((a, b) => a.seat - b.seat);
  const boardWidth = Math.floor(Math.min(width - 2 * space.lg, height * 0.54, 560));
  const current = state.players.find((p) => p.seat === state.turn);
  const emoteFor = (p: SyncedPlayer) => [...snap.emotes].reverse().find((e) => e.seat === p.seat)?.e;
  const myColor = me ? playerColor(me.seat) : colors.primary;
  const canWall = myTurn && (me?.wallsLeft ?? 0) > 0;

  const placeWall = () => {
    if (!draft || draftError || !view) return;
    const w = toModelWall(view, draft);
    tap('heavy');
    session.send('wall', { x: w.x, y: w.y, o: w.o });
    setDraft(null);
    setMode('move');
  };

  return (
    <Screen>
      <View style={styles.topBar}>
        <IconButton label="⚑" accessibilityLabel="Leave or resign" onPress={() => setConfirmLeave(true)} size={40} />
        <View style={{ flex: 1, alignItems: 'center' }}>
          <T variant="caption" style={{ letterSpacing: 1.2 }}>
            {game.config.mode === 'duel' ? 'DUEL' : `TABLE OF ${state.playerCount}`} ·{' '}
            {state.isPrivate ? state.code : 'ONLINE'}
          </T>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.chips}>
        {others.map((p) => (
          <PlayerChip key={p.sessionId} state={state} player={p} now={now} isMe={false} emote={emoteFor(p)} />
        ))}
      </View>

      <View style={styles.turnRow}>
        {playing && current ? (
          <View style={styles.turnPill}>
            <View style={[styles.turnDot, { backgroundColor: playerColor(current.seat) }]} />
            <T variant="label" style={{ color: myTurn ? myColor : colors.text }}>
              {myTurn
                ? mode === 'wall'
                  ? 'Drag on the board to aim your wall'
                  : 'Your turn — move or place a wall'
                : `${current.name} is ${current.bot ? 'thinking' : 'playing'}…`}
            </T>
          </View>
        ) : null}
      </View>

      <View style={styles.boardWrap}>
        <Board
          state={state}
          game={game}
          view={view}
          width={boardWidth}
          mySeat={mySeat}
          interactive={myTurn}
          mode={mode}
          draft={draft}
          draftValid={!draftError}
          onDraft={setDraft}
          onMove={(c) => {
            tap('medium');
            session.send('move', { x: c.x, y: c.y });
          }}
        />
        {state.phase === 'countdown' ? <Countdown value={countdown} /> : null}
      </View>

      <View style={styles.bottom}>
        {me ? <PlayerChip state={state} player={me} now={now} isMe large emote={emoteFor(me)} /> : null}

        {mode === 'wall' && myTurn ? (
          <View style={styles.controls}>
            <Button
              title="Rotate"
              icon="↻"
              variant="secondary"
              disabled={!draft}
              onPress={() => draft && setDraft({ ...draft, o: draft.o === 'h' ? 'v' : 'h' })}
              style={{ flex: 1 }}
            />
            <Button
              title="Place"
              icon="✓"
              onPress={placeWall}
              disabled={!draft || !!draftError}
              style={{ flex: 1.3 }}
            />
            <IconButton
              label="✕"
              accessibilityLabel="Cancel wall"
              onPress={() => {
                setDraft(null);
                setMode('move');
              }}
              size={56}
            />
          </View>
        ) : (
          <View style={styles.controls}>
            <ModeButton
              label="Move"
              icon="👣"
              active={mode === 'move'}
              disabled={!myTurn}
              color={myColor}
              onPress={() => setMode('move')}
            />
            <ModeButton
              label={`Wall · ${me?.wallsLeft ?? 0}`}
              icon="🧱"
              active={false}
              disabled={!canWall}
              color={myColor}
              onPress={() => setMode('wall')}
            />
          </View>
        )}
        {mode === 'wall' && draftError && draft ? (
          <T variant="caption" style={styles.hint}>
            {describeActionError(draftError)}
          </T>
        ) : null}

        <View style={styles.emotes}>
          {EMOTES.map((e) => (
            <Pressable
              key={e}
              accessibilityRole="button"
              accessibilityLabel={`Send ${e}`}
              onPress={() => {
                tap();
                session.send('emote', { e });
              }}
              style={({ pressed }) => [styles.emoteBtn, pressed && { transform: [{ scale: 0.88 }] }]}
            >
              <T style={{ fontSize: 20 }}>{e}</T>
            </Pressable>
          ))}
        </View>
      </View>

      {toast ? (
        <Animated.View style={styles.toast} pointerEvents="none">
          <T variant="label" style={{ textAlign: 'center' }}>
            {toast}
          </T>
        </Animated.View>
      ) : null}

      {state.phase === 'finished' ? (
        <ResultCard state={state} sessionId={sessionId} onRematch={() => session.send('rematch')} onLeave={leave} />
      ) : null}

      <ConnectionBanner status={status} error={snap.error} />

      <Modal transparent visible={confirmLeave} animationType="fade" onRequestClose={() => setConfirmLeave(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setConfirmLeave(false)}>
          <Pressable style={styles.modal} onPress={() => {}}>
            <T variant="heading">Leave this game?</T>
            <T variant="body" style={{ color: colors.textMuted, marginVertical: space.md }}>
              {me?.status === 'active' && playing
                ? 'Leaving counts as resigning — the others play on without you.'
                : 'You will return to the main menu.'}
            </T>
            <Button
              title={me?.status === 'active' && playing ? 'Resign & leave' : 'Leave'}
              variant="danger"
              onPress={leave}
            />
            <Button
              title="Keep playing"
              variant="ghost"
              onPress={() => setConfirmLeave(false)}
              style={{ marginTop: space.sm }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

function ModeButton({
  label,
  icon,
  active,
  disabled,
  color,
  onPress,
}: {
  label: string;
  icon: string;
  active: boolean;
  disabled: boolean;
  color: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active, disabled }}
      disabled={disabled}
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [
        styles.modeBtn,
        active && !disabled && { borderColor: color, backgroundColor: alpha(color, 0.14) },
        disabled && { opacity: 0.4 },
        pressed && { transform: [{ scale: 0.97 }] },
      ]}
    >
      <T style={{ fontSize: 18 }}>{icon}</T>
      <T variant="label" style={active && !disabled ? { color } : undefined}>
        {label}
      </T>
    </Pressable>
  );
}

function Countdown({ value }: { value: number }) {
  return (
    <Animated.View style={styles.countdown} pointerEvents="none">
      <Animated.Text key={value} style={styles.countdownText}>
        {value}
      </Animated.Text>
      <T variant="label" style={{ color: colors.textMuted }}>
        Get ready…
      </T>
    </Animated.View>
  );
}

function ConnectionBanner({ status, error }: { status: string; error: string | null }) {
  if (status === 'reconnecting') {
    return (
      <View style={[styles.conn, { borderColor: alpha(colors.gold, 0.5) }]}>
        <ActivityIndicator color={colors.gold} size="small" />
        <T variant="caption" style={{ color: colors.gold }}>
          Connection lost — reconnecting…
        </T>
      </View>
    );
  }
  if (status === 'closed' && error) {
    return (
      <View style={[styles.conn, { borderColor: alpha(colors.danger, 0.5) }]}>
        <T variant="caption" style={{ color: colors.danger, flex: 1 }}>
          {error}
        </T>
        <Button title="Home" variant="secondary" onPress={() => router.replace('/')} style={{ height: 36 }} />
      </View>
    );
  }
  return null;
}

const styles = StyleSheet.create({
  center: { justifyContent: 'center', alignItems: 'center' },
  centerBox: { alignItems: 'center', padding: space.xl },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, paddingTop: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, paddingHorizontal: space.lg, marginTop: space.md },
  turnRow: { height: 44, alignItems: 'center', justifyContent: 'center' },
  turnPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  turnDot: { width: 10, height: 10, borderRadius: 5 },
  boardWrap: { alignItems: 'center', justifyContent: 'center' },
  bottom: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: space.lg, paddingBottom: space.sm, gap: space.sm },
  controls: { flexDirection: 'row', gap: space.sm, alignItems: 'center' },
  modeBtn: {
    flex: 1,
    height: 56,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
  hint: { textAlign: 'center', color: colors.danger },
  emotes: { flexDirection: 'row', justifyContent: 'space-between' },
  emoteBtn: {
    width: 44,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  toast: {
    position: 'absolute',
    left: space.xl,
    right: space.xl,
    bottom: 150,
    backgroundColor: colors.surfaceHi,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: alpha(colors.danger, 0.5),
    padding: space.md,
  },
  countdown: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(5,6,16,0.6)',
  },
  countdownText: { fontFamily: fonts.bold, fontSize: 96, color: colors.text },
  conn: {
    position: 'absolute',
    top: 56,
    left: space.lg,
    right: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: colors.surfaceHi,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.md,
  },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(3,4,12,0.7)', justifyContent: 'center', padding: space.xl },
  modal: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderHi,
    padding: space.xl,
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
  },
});
