/** Global context menus, text prompts and toasts. */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { create } from 'zustand';

// ---- Toast -----------------------------------------------------------------
const useToast = create<{ text: string | null }>(() => ({ text: null }));
let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function toast(text: string) {
  useToast.setState({ text });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => useToast.setState({ text: null }), 3000);
}

// ---- Menu ------------------------------------------------------------------
export type MenuItem = { label: string; onSelect: () => void; danger?: boolean; hidden?: boolean } | 'divider';
type MenuState = { x: number; y: number; items: MenuItem[]; title?: string } | null;
const useMenu = create<{ menu: MenuState }>(() => ({ menu: null }));

/** Open a menu next to the clicked element (or at the pointer for right-clicks). */
export function openMenu(e: { clientX: number; clientY: number; currentTarget?: EventTarget | null }, items: MenuItem[], title?: string) {
  const el = e.currentTarget instanceof HTMLElement ? e.currentTarget.getBoundingClientRect() : null;
  const x = el && !e.clientX ? el.left : e.clientX;
  const y = el && !e.clientY ? el.bottom : e.clientY;
  useMenu.setState({ menu: { x, y, items: items.filter((i) => i === 'divider' || !i.hidden), title } });
}
const closeMenu = () => useMenu.setState({ menu: null });

function MenuHost() {
  const menu = useMenu((s) => s.menu);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeMenu();
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && closeMenu();
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown);
    window.addEventListener('resize', closeMenu);
    ref.current?.querySelector('button')?.focus();
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('resize', closeMenu);
    };
  }, [menu]);

  // Keep the menu inside the viewport once its size is known.
  useEffect(() => {
    if (!menu || !ref.current) return setPos(null);
    const { width, height } = ref.current.getBoundingClientRect();
    setPos({ left: Math.max(8, Math.min(menu.x, window.innerWidth - width - 8)), top: Math.max(8, Math.min(menu.y, window.innerHeight - height - 8)) });
  }, [menu]);

  if (!menu) return null;
  return (
    <div ref={ref} className="menu" role="menu" style={{ left: pos?.left ?? menu.x, top: pos?.top ?? menu.y, visibility: pos ? 'visible' : 'hidden' }}>
      {menu.title && <div className="label">{menu.title}</div>}
      {menu.items.map((item, i) =>
        item === 'divider' ? (
          <hr key={i} />
        ) : (
          <button
            key={item.label}
            role="menuitem"
            className={item.danger ? 'danger' : ''}
            onClick={() => {
              closeMenu();
              item.onSelect();
            }}
          >
            {item.label}
          </button>
        ),
      )}
    </div>
  );
}

// ---- Prompt / confirm ------------------------------------------------------
type Dialog =
  | { kind: 'prompt'; title: string; initial: string; confirm: string; resolve: (v: string | null) => void }
  | { kind: 'confirm'; title: string; body?: ReactNode; confirm: string; danger?: boolean; resolve: (ok: boolean) => void };
const useDialog = create<{ dialog: Dialog | null }>(() => ({ dialog: null }));

export const prompt = (title: string, initial = '', confirm = 'Save') =>
  new Promise<string | null>((resolve) => useDialog.setState({ dialog: { kind: 'prompt', title, initial, confirm, resolve } }));

export const confirmDialog = (title: string, body?: ReactNode, confirm = 'OK', danger = false) =>
  new Promise<boolean>((resolve) => useDialog.setState({ dialog: { kind: 'confirm', title, body, confirm, danger, resolve } }));

function PromptBody({ dialog }: { dialog: Extract<Dialog, { kind: 'prompt' }> }) {
  const [value, setValue] = useState(dialog.initial);
  const done = (v: string | null) => {
    useDialog.setState({ dialog: null });
    dialog.resolve(v);
  };
  return (
    <form
      className="modal"
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) done(value.trim());
      }}
    >
      <h2>{dialog.title}</h2>
      <input className="input" autoFocus value={value} maxLength={100} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && done(null)} />
      <div className="row">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => done(null)}>
          Cancel
        </button>
        <button className="btn btn-primary btn-sm" disabled={!value.trim()}>
          {dialog.confirm}
        </button>
      </div>
    </form>
  );
}

function DialogHost() {
  const dialog = useDialog((s) => s.dialog);
  if (!dialog) return null;
  if (dialog.kind === 'prompt') {
    return (
      <div className="modal-backdrop" role="dialog" aria-modal aria-label={dialog.title}>
        <PromptBody dialog={dialog} />
      </div>
    );
  }
  const done = (ok: boolean) => {
    useDialog.setState({ dialog: null });
    dialog.resolve(ok);
  };
  return (
    <div className="modal-backdrop" role="dialog" aria-modal aria-label={dialog.title} onKeyDown={(e) => e.key === 'Escape' && done(false)}>
      <div className="modal">
        <h2>{dialog.title}</h2>
        {dialog.body && <div className="muted">{dialog.body}</div>}
        <div className="row">
          <button className="btn btn-secondary btn-sm" onClick={() => done(false)}>
            Cancel
          </button>
          <button autoFocus className={`btn btn-sm ${dialog.danger ? 'btn-danger' : 'btn-primary'}`} onClick={() => done(true)}>
            {dialog.confirm}
          </button>
        </div>
      </div>
    </div>
  );
}

export function OverlayHost() {
  const text = useToast((s) => s.text);
  return (
    <>
      <MenuHost />
      <DialogHost />
      {text && (
        <div className="toast" role="status">
          {text}
        </div>
      )}
    </>
  );
}
