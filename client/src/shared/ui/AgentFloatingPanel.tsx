import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';

const POSITION_STORAGE_KEY = 'yibiao.agent-floating-position';
const ORB_SIZE = 52;
const EDGE_GAP = 18;
const DRAG_THRESHOLD = 5;

type DockSide = 'left' | 'right';

interface SavedPosition {
  side: DockSide;
  y: number;
}

interface DragPosition {
  x: number;
  y: number;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getVerticalBounds() {
  return { min: 76, max: Math.max(76, window.innerHeight - ORB_SIZE - 76) };
}

function loadSavedPosition(): SavedPosition {
  try {
    const value = JSON.parse(localStorage.getItem(POSITION_STORAGE_KEY) || '') as Partial<SavedPosition>;
    if ((value.side === 'left' || value.side === 'right') && Number.isFinite(value.y)) {
      const bounds = getVerticalBounds();
      return { side: value.side, y: clamp(Number(value.y), bounds.min, bounds.max) };
    }
  } catch {
    // Ignore invalid legacy UI preferences.
  }
  return { side: 'right', y: clamp(window.innerHeight * 0.32, 76, window.innerHeight - ORB_SIZE - 76) };
}

export interface AgentFloatingPanelProps {
  label: string;
  className?: string;
  children: ReactNode;
}

export default function AgentFloatingPanel({ label, className = '', children }: AgentFloatingPanelProps) {
  const [open, setOpen] = useState(false);
  const [savedPosition, setSavedPosition] = useState<SavedPosition>(loadSavedPosition);
  const [dragPosition, setDragPosition] = useState<DragPosition | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number; currentX: number; currentY: number; moved: boolean } | null>(null);
  const suppressClickRef = useRef(false);

  const snappedX = savedPosition.side === 'left' ? EDGE_GAP : window.innerWidth - ORB_SIZE - EDGE_GAP;
  const position = dragPosition || { x: snappedX, y: savedPosition.y };
  const panelStyle = { top: `${position.y}px`, left: `${position.x}px`, right: 'auto' } as CSSProperties;

  useEffect(() => {
    if (!open) return;

    const closeWhenOutside = (event: PointerEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('pointerdown', closeWhenOutside);
    document.addEventListener('keydown', closeWithEscape);
    return () => {
      document.removeEventListener('pointerdown', closeWhenOutside);
      document.removeEventListener('keydown', closeWithEscape);
    };
  }, [open]);

  useEffect(() => {
    const keepInsideViewport = () => {
      const bounds = getVerticalBounds();
      setSavedPosition((current) => ({ ...current, y: clamp(current.y, bounds.min, bounds.max) }));
    };
    window.addEventListener('resize', keepInsideViewport);
    return () => window.removeEventListener('resize', keepInsideViewport);
  }, []);

  function startDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: bounds.left,
      originY: bounds.top,
      currentX: bounds.left,
      currentY: bounds.top,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(deltaX, deltaY) < DRAG_THRESHOLD) return;
    drag.moved = true;
    setOpen(false);
    const bounds = getVerticalBounds();
    drag.currentX = clamp(drag.originX + deltaX, EDGE_GAP, window.innerWidth - ORB_SIZE - EDGE_GAP);
    drag.currentY = clamp(drag.originY + deltaY, bounds.min, bounds.max);
    setDragPosition({ x: drag.currentX, y: drag.currentY });
  }

  function finishDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);

    if (drag.moved) {
      const nextPosition: SavedPosition = {
        side: drag.currentX + ORB_SIZE / 2 < window.innerWidth / 2 ? 'left' : 'right',
        y: drag.currentY,
      };
      setSavedPosition(nextPosition);
      localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(nextPosition));
      suppressClickRef.current = true;
    }
    setDragPosition(null);
    dragRef.current = null;
  }

  function togglePanel() {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    setOpen((current) => !current);
  }

  return (
    <aside
      ref={panelRef}
      style={panelStyle}
      className={`agent-floating-panel is-${savedPosition.side} ${position.y > window.innerHeight / 2 ? 'is-lower' : ''} ${open ? 'is-open' : ''} ${dragPosition ? 'is-dragging' : ''} ${className}`.trim()}
    >
      <button
        type="button"
        className="agent-floating-trigger"
        aria-label={`${open ? '收起' : '展开'}${label}`}
        aria-expanded={open}
        onClick={togglePanel}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
      >
        <span className="agent-floating-glyph" aria-hidden="true" />
      </button>
      {!open && <span className="agent-floating-hint">{label}</span>}
      <div className="agent-floating-content" aria-hidden={!open}>
        <button type="button" className="agent-floating-close" onClick={() => setOpen(false)}>收起</button>
        {children}
      </div>
    </aside>
  );
}
