import { itemArtwork, itemSubtitle } from '../api/types';
import { Artwork, IconButton } from '../components/ui';
import { usePlayer } from './store';

export function QueuePanel({ onClose }: { onClose: () => void }) {
  const queue = usePlayer((s) => s.queue);
  const index = usePlayer((s) => s.index);
  const { jumpTo, removeFromQueue, moveInQueue, clearQueue } = usePlayer.getState();
  const current = queue[index];
  const upNext = queue.slice(index + 1);

  return (
    <aside className="side-panel" aria-label="Queue">
      <header>
        Queue
        <IconButton icon="close" label="Close queue" onClick={onClose} />
      </header>
      <div className="body">
        {!current ? (
          <p className="muted" style={{ padding: '0 8px' }}>
            Your queue is empty.
          </p>
        ) : (
          <>
            <p className="muted small" style={{ padding: '0 8px', fontWeight: 700 }}>
              NOW PLAYING
            </p>
            <div className="q-item">
              <Artwork src={itemArtwork(current)} size={40} />
              <div className="meta">
                <div className="title" style={{ color: 'var(--accent)' }}>
                  {current.title}
                </div>
                <div className="sub">{itemSubtitle(current)}</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 8px 4px' }}>
              <span className="muted small" style={{ fontWeight: 700 }}>
                NEXT UP
              </span>
              {upNext.length > 0 && (
                <button className="btn btn-sm" onClick={clearQueue}>
                  Clear
                </button>
              )}
            </div>
            {upNext.map((q, i) => {
              const abs = index + 1 + i;
              return (
                <div className="q-item" key={q.qid}>
                  <Artwork src={itemArtwork(q)} size={40} />
                  <div className="meta" onDoubleClick={() => jumpTo(abs)} onClick={() => jumpTo(abs)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && jumpTo(abs)}>
                    <div className="title">{q.title}</div>
                    <div className="sub">{itemSubtitle(q)}</div>
                  </div>
                  <div className="acts">
                    <IconButton icon="up" label="Move up" size={18} disabled={i === 0} onClick={() => moveInQueue(abs, abs - 1)} />
                    <IconButton icon="down" label="Move down" size={18} disabled={abs === queue.length - 1} onClick={() => moveInQueue(abs, abs + 1)} />
                    <IconButton icon="close" label="Remove from queue" size={18} onClick={() => removeFromQueue(q.qid)} />
                  </div>
                </div>
              );
            })}
            {!upNext.length && (
              <p className="muted small" style={{ padding: '0 8px' }}>
                Add songs with “Add to queue” from any song’s menu.
              </p>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
