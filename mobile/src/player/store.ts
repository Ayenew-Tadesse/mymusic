/**
 * Playback state: queue, shuffle, repeat, sleep timer.
 *
 * The queue can mix two kinds of items:
 *  - licensed catalog tracks: played by react-native-track-player, which
 *    supports background playback and lock-screen controls;
 *  - YouTube videos: played only by the official embedded player, visible on
 *    the Now Playing screen. They never play in the background or audio-only,
 *    as the YouTube API Terms require.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { MediaItem } from '@/api/types';
import type { PlayReport } from '@/api/endpoints';
import { engine } from './engine';

export type RepeatMode = 'off' | 'all' | 'one';
export type PlayContext = NonNullable<PlayReport['context']>;
export type QueueItem = MediaItem & { qid: string };
export type Status = 'idle' | 'loading' | 'playing' | 'paused' | 'error';

type PlayerState = {
  queue: QueueItem[];
  /** Queue order before shuffling, so turning shuffle off restores it. */
  unshuffled: QueueItem[] | null;
  index: number;
  shuffle: boolean;
  repeat: RepeatMode;
  status: Status;
  error: string | null;
  position: number;
  duration: number;
  context: PlayContext | null;
  /** Epoch ms when playback should stop, or 'end' to stop after the current item. */
  sleepAt: number | 'end' | null;

  current: () => QueueItem | null;
  playItems: (items: MediaItem[], startIndex?: number, context?: PlayContext) => Promise<void>;
  playNext: (item: MediaItem) => void;
  addToQueue: (item: MediaItem) => void;
  removeFromQueue: (qid: string) => void;
  moveInQueue: (from: number, to: number) => void;
  clearQueue: () => void;
  jumpTo: (index: number) => Promise<void>;
  next: (opts?: { auto?: boolean }) => Promise<void>;
  previous: () => Promise<void>;
  togglePlay: () => Promise<void>;
  seekTo: (sec: number) => Promise<void>;
  stop: () => Promise<void>;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  setSleepTimer: (minutes: number | 'end' | null) => void;
  /** Called by the engines to publish progress / status. */
  report: (patch: Partial<Pick<PlayerState, 'status' | 'position' | 'duration' | 'error'>>) => void;
};

let qidCounter = 0;
const withQid = (item: MediaItem): QueueItem => ({ ...item, qid: `${Date.now().toString(36)}-${(qidCounter++).toString(36)}` });
const isPlayable = (i: MediaItem) => !i.unavailable && (i.kind === 'youtube' || i.playable);

function shuffled<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const usePlayer = create<PlayerState>()(
  persist(
    (set, get) => ({
      queue: [],
      unshuffled: null,
      index: 0,
      shuffle: false,
      repeat: 'off',
      status: 'idle',
      error: null,
      position: 0,
      duration: 0,
      context: null,
      sleepAt: null,

      current: () => get().queue[get().index] ?? null,

      async playItems(items, startIndex = 0, context) {
        const playable = items.filter(isPlayable);
        const start = items[startIndex];
        if (!playable.length) return;
        let queue = playable.map(withQid);
        let index = Math.max(0, start ? playable.indexOf(start) : 0);
        let unshuffled: QueueItem[] | null = null;
        if (get().shuffle) {
          // Keep the tapped item first, shuffle the rest.
          unshuffled = queue;
          const first = queue[index];
          queue = [first, ...shuffled(queue.filter((q) => q !== first))];
          index = 0;
        }
        set({ queue, unshuffled, index, context: context ?? null, position: 0, error: null });
        await engine.load(get().queue[index], true);
      },

      playNext(item) {
        const { queue, index } = get();
        const q = withQid(item);
        set({ queue: [...queue.slice(0, index + 1), q, ...queue.slice(index + 1)] });
        if (!queue.length) void engine.load(q, true);
      },

      addToQueue(item) {
        const { queue } = get();
        const q = withQid(item);
        set({ queue: [...queue, q], unshuffled: get().unshuffled ? [...get().unshuffled!, q] : null });
        if (!queue.length) void engine.load(q, true);
      },

      removeFromQueue(qid) {
        const { queue, index } = get();
        const at = queue.findIndex((q) => q.qid === qid);
        if (at === -1 || at === index) return; // the playing item can't be removed
        set({
          queue: queue.filter((q) => q.qid !== qid),
          index: at < index ? index - 1 : index,
          unshuffled: get().unshuffled?.filter((q) => q.qid !== qid) ?? null,
        });
      },

      moveInQueue(from, to) {
        const { queue, index } = get();
        if (from === to || from < 0 || to < 0 || from >= queue.length || to >= queue.length) return;
        const next = queue.slice();
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved);
        const currentQid = queue[index]?.qid;
        set({ queue: next, index: next.findIndex((q) => q.qid === currentQid) });
      },

      clearQueue() {
        const cur = get().current();
        set({ queue: cur ? [cur] : [], unshuffled: null, index: 0 });
      },

      async jumpTo(i) {
        if (i < 0 || i >= get().queue.length) return;
        engine.reportPlay();
        set({ index: i, position: 0 });
        await engine.load(get().queue[i], true);
      },

      async next({ auto = false } = {}) {
        const { queue, index, repeat, sleepAt } = get();
        if (!queue.length) return;
        engine.reportPlay({ completed: auto });

        if (auto && sleepAt === 'end') {
          set({ sleepAt: null });
          await engine.pause();
          return;
        }
        if (auto && repeat === 'one') {
          await engine.load(queue[index], true);
          return;
        }
        let nextIndex = index + 1;
        if (nextIndex >= queue.length) {
          if (repeat !== 'all') {
            await engine.pause();
            await engine.seek(0);
            return;
          }
          nextIndex = 0;
        }
        const nextItem = queue[nextIndex];
        set({ index: nextIndex, position: 0 });
        // YouTube can't play in the background: stop at the boundary.
        const backgrounded = AppState.currentState !== 'active';
        await engine.load(nextItem, !(backgrounded && nextItem.kind === 'youtube'));
      },

      async previous() {
        const { index, position, queue } = get();
        // Like most players: restart the track if more than 3 s in.
        if (position > 3 || index === 0) {
          await engine.seek(0);
          return;
        }
        engine.reportPlay();
        set({ index: index - 1, position: 0 });
        await engine.load(queue[index - 1], true);
      },

      async togglePlay() {
        const { status, queue, index } = get();
        if (status === 'playing') await engine.pause();
        else if (status === 'idle' && queue[index]) await engine.load(queue[index], true);
        else await engine.play();
      },

      seekTo: (sec) => engine.seek(sec),

      async stop() {
        engine.reportPlay();
        await engine.stop();
        set({ status: 'idle', position: 0 });
      },

      toggleShuffle() {
        const { shuffle, queue, index, unshuffled } = get();
        const current = queue[index];
        if (!shuffle) {
          const rest = shuffled(queue.filter((_, i) => i !== index));
          set({ shuffle: true, unshuffled: queue, queue: current ? [current, ...rest] : rest, index: 0 });
        } else {
          const restored = unshuffled ?? queue;
          set({ shuffle: false, unshuffled: null, queue: restored, index: Math.max(0, restored.findIndex((q) => q.qid === current?.qid)) });
        }
      },

      cycleRepeat() {
        const order: RepeatMode[] = ['off', 'all', 'one'];
        const repeat = order[(order.indexOf(get().repeat) + 1) % order.length];
        set({ repeat });
        engine.setRepeatOne(repeat === 'one');
      },

      setSleepTimer(minutes) {
        set({ sleepAt: minutes === null ? null : minutes === 'end' ? 'end' : Date.now() + minutes * 60_000 });
      },

      report: (patch) => set(patch),
    }),
    {
      name: 'mm.player',
      storage: createJSONStorage(() => AsyncStorage),
      // Persist the queue and modes, never transient playback status.
      partialize: (s) => ({ queue: s.queue.slice(0, 500), index: s.index, shuffle: s.shuffle, repeat: s.repeat, context: s.context }),
    },
  ),
);

/** Checks the timed sleep timer; called from the playback service and a foreground interval. */
export async function checkSleepTimer() {
  const { sleepAt } = usePlayer.getState();
  if (typeof sleepAt === 'number' && Date.now() >= sleepAt) {
    usePlayer.setState({ sleepAt: null });
    await engine.pause();
  }
}
