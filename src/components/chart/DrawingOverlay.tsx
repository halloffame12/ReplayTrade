import { BringToFront, Copy, EyeOff, Lock, SendToBack, Trash2 } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { Drawing } from '../../drawing';
import { TOOL_LABELS } from '../../drawing';

export interface TextEditorState {
  id: string;
  value: string;
  pos: { x: number; y: number } | null;
}

export interface DrawingOverlayProps {
  selected: Drawing | null;
  actionMenuPos: { x: number; y: number } | null;
  textEditor: TextEditorState | null;
  onTextChange: (value: string) => void;
  onTextCommit: () => void;
  onDuplicate: () => void;
  onLock: () => void;
  onHide: () => void;
  onDelete: () => void;
  onLayerFront: () => void;
  onLayerBack: () => void;
}

function MenuBtn({
  title,
  danger = false,
  onClick,
  children,
}: {
  title: string;
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={`flex h-7 w-7 items-center justify-center rounded-sm transition-colors ${
        danger ? 'text-text-secondary hover:bg-down-dim hover:text-down' : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'
      }`}
    >
      {children}
    </button>
  );
}

export function DrawingOverlay({
  selected,
  actionMenuPos,
  textEditor,
  onTextChange,
  onTextCommit,
  onDuplicate,
  onLock,
  onHide,
  onDelete,
  onLayerFront,
  onLayerBack,
}: DrawingOverlayProps) {
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    if (textEditor) {
      const ta = taRef.current;
      if (ta) {
        ta.focus();
        ta.select();
      }
    }
  }, [textEditor?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="pointer-events-none absolute inset-0 z-30">
      {/* Floating action menu for the selected drawing. */}
      {selected && actionMenuPos && (
        <div
          className="pointer-events-auto absolute flex -translate-x-full items-center gap-0.5 rounded-md border border-bg-border bg-bg-panel/95 p-1 shadow-neo backdrop-blur-sm"
          style={{ left: actionMenuPos.x - 8, top: actionMenuPos.y - 4, transform: 'translate(-100%, 0)' }}
          onPointerDown={(e) => e.stopPropagation()}
          role="menu"
          aria-label={`${TOOL_LABELS[selected.type]} actions`}
        >
          <MenuBtn title="Duplicate drawing" onClick={onDuplicate}>
            <Copy size={13} />
          </MenuBtn>
          <MenuBtn title={selected.locked ? 'Unlock drawing' : 'Lock drawing'} onClick={onLock}>
            <Lock size={13} />
          </MenuBtn>
          <MenuBtn title={selected.visible ? 'Hide drawing' : 'Show drawing'} onClick={onHide}>
            <EyeOff size={13} />
          </MenuBtn>
          <MenuBtn title="Bring to front" onClick={onLayerFront}>
            <BringToFront size={13} />
          </MenuBtn>
          <MenuBtn title="Send to back" onClick={onLayerBack}>
            <SendToBack size={13} />
          </MenuBtn>
          <span className="mx-0.5 h-4 w-px bg-bg-border" />
          <MenuBtn title="Delete drawing" danger onClick={onDelete}>
            <Trash2 size={13} />
          </MenuBtn>
        </div>
      )}

      {/* Inline text editor (Text tool). */}
      {textEditor && (
        <textarea
          ref={taRef}
          value={textEditor.value}
          onChange={(e) => onTextChange(e.target.value)}
          onBlur={onTextCommit}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              onTextCommit();
            }
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              onTextCommit();
            }
          }}
          placeholder="Type…"
          rows={1}
          aria-label="Drawing text"
          className="pointer-events-auto absolute z-40 w-48 resize-none rounded-sm border border-accent bg-bg-panel px-2 py-1 font-mono text-[11px] leading-snug text-text-primary shadow-neo outline-none"
          style={
            textEditor.pos
              ? { left: textEditor.pos.x, top: textEditor.pos.y, transform: 'translate(-50%, -50%)' }
              : { left: '50%', top: '50%' }
          }
        />
      )}
    </div>
  );
}
