/**
 * Listening history reporting. A play is recorded once it lasted 30 s or
 * completed. Reports made offline are queued in storage and uploaded later.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Library, type PlayReport } from '@/api/endpoints';
import { itemRef, type MediaItem } from '@/api/types';
import { offline } from '@/offline/manager';

const PENDING_KEY = 'mm.pendingPlays';
let active: { item: MediaItem; startedAt: Date; context: PlayReport['context'] | null } | null = null;
let flushing = false;

async function enqueue(report: PlayReport) {
  const raw = await AsyncStorage.getItem(PENDING_KEY);
  const pending: PlayReport[] = raw ? JSON.parse(raw) : [];
  pending.push(report);
  // Bound the buffer so a long offline period can't grow storage forever.
  await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(pending.slice(-1000)));
}

export const history = {
  begin(item: MediaItem, context: PlayReport['context'] | null) {
    active = { item, startedAt: new Date(), context };
  },

  end(positionSec: number, completed: boolean) {
    if (!active) return;
    const { item, startedAt, context } = active;
    active = null;
    const msPlayed = Math.round(positionSec * 1000);
    if (msPlayed < 30_000 && !completed) return;
    void enqueue({
      ...itemRef(item),
      msPlayed,
      completed,
      offline: item.kind === 'catalog' && offline.isDownloaded(item.id),
      playedAt: startedAt.toISOString(),
      ...(context && { context }),
    }).then(history.flush);
  },

  /** Upload queued plays in batches of 100. Safe to call often. */
  async flush() {
    if (flushing) return;
    flushing = true;
    try {
      for (;;) {
        const raw = await AsyncStorage.getItem(PENDING_KEY);
        const pending: PlayReport[] = raw ? JSON.parse(raw) : [];
        if (!pending.length) return;
        const batch = pending.slice(0, 100);
        await Library.reportPlays(batch);
        const after: PlayReport[] = JSON.parse((await AsyncStorage.getItem(PENDING_KEY)) ?? '[]');
        await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(after.slice(batch.length)));
      }
    } catch {
      // Offline or server error: keep the queue and retry later.
    } finally {
      flushing = false;
    }
  },
};
