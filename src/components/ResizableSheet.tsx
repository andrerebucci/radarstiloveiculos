import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from './ui/sheet';
import { GripVertical } from 'lucide-react';

interface Props {
  trigger: ReactNode;
  title: ReactNode;
  children: ReactNode;
  /** Largura inicial em px. */
  defaultWidth?: number;
  storageKey?: string;
}

/** Sheet do lado direito com largura ajustável (arrastar pela borda esquerda). */
export function ResizableSheet({ trigger, title, children, defaultWidth = 900, storageKey }: Props) {
  const [width, setWidth] = useState<number>(() => {
    if (storageKey) {
      const saved = parseInt(localStorage.getItem(storageKey) || '', 10);
      if (!Number.isNaN(saved) && saved > 320) return saved;
    }
    return Math.min(defaultWidth, typeof window !== 'undefined' ? window.innerWidth * 0.95 : defaultWidth);
  });
  const draggingRef = useRef(false);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    const next = Math.min(window.innerWidth - 40, Math.max(360, window.innerWidth - e.clientX));
    setWidth(next);
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    draggingRef.current = false;
    try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
    if (storageKey) localStorage.setItem(storageKey, String(width));
  }, [storageKey, width]);

  useEffect(() => {
    if (storageKey) localStorage.setItem(storageKey, String(width));
  }, [width, storageKey]);

  return (
    <Sheet>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent
        className="p-0 overflow-hidden sm:max-w-none"
        style={{ width: `${width}px`, maxWidth: '95vw' }}
      >
        {/* Handle de redimensionamento na borda esquerda */}
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          className="absolute left-0 top-0 h-full w-2 cursor-ew-resize bg-transparent hover:bg-primary/20 z-50 flex items-center justify-center"
          title="Arraste para redimensionar"
        >
          <GripVertical className="h-4 w-4 text-muted-foreground opacity-0 hover:opacity-100" />
        </div>
        <div className="h-full overflow-y-auto p-6 pl-8">
          <SheetHeader>
            <SheetTitle>{title}</SheetTitle>
          </SheetHeader>
          <div className="mt-4">{children}</div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
