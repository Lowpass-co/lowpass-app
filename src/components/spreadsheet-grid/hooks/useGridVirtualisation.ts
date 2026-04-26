import { useCallback, useLayoutEffect, useRef, useState } from 'react';

const DEFAULT_OVERSCAN = 10;

export function useGridVirtualisation(itemCount: number, rowHeightPx: number) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewH, setViewH] = useState(400);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setViewH(el.clientHeight);
    });
    ro.observe(el);
    setViewH(el.clientHeight);
    return () => ro.disconnect();
  }, []);

  const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  const visible = Math.max(1, Math.ceil(viewH / rowHeightPx) + 1);
  const start = Math.max(0, Math.floor(scrollTop / rowHeightPx) - DEFAULT_OVERSCAN);
  const end = Math.min(itemCount, start + visible + DEFAULT_OVERSCAN * 2);
  const offsetY = start * rowHeightPx;
  const totalHeight = itemCount * rowHeightPx;

  return {
    scrollRef,
    onScroll,
    startIndex: start,
    endIndex: end,
    offsetY,
    totalHeight,
    viewHeight: viewH,
  };
}
