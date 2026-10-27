/**
 * Listening history: a play counts after 30 s or when completed. Reports are
 * buffered in localStorage and uploaded in batches, so none are lost when the
 * connection drops or the tab closes.
 */
import { Library, type PlayReport } from '../api/endpoints';
import { itemRef, type MediaItem } from '../api/types';

const KEY = 'mm.pendingPlays';
let active: { item: MediaItem; startedAt: Date; context: PlayReport['context'] | null } | null = null;
let flushing = false;

const read = (): PlayReport[] => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]');
  } catch {
    return [];
  }
};
const write = (v: PlayReport[]) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(v.slice(-1000)));
  } catch {
    // storage full or blocked: drop silently
  }
};

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
    write([...read(), { ...itemRef(item), msPlayed, completed, offline: false, playedAt: startedAt.toISOString(), ...(context && { context }) }]);
    void history.flush();
  },

  async flush() {
    if (flushing) return;
    flushing = true;
    try {
      for (;;) {
        const pending = read();
        if (!pending.length) return;
        const batch = pending.slice(0, 100);
        await Library.reportPlays(batch);
        write(read().slice(batch.length));
      }
    } catch {
      // keep for the next attempt
    } finally {
      flushing = false;
    }
  },
};
