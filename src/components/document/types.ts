import type { ReactNode } from 'react';

export type DocumentCanvasProseProps = {
  mode: 'prose';
  sections: Array<{ id: string; label: string }>;
  activeSection?: string;
  onSectionChange?: (id: string) => void;
  editable?: boolean;
  children: ReactNode;
  className?: string;
  /** Scrolling region max height. */
  maxHeight?: string;
  /**
   * UX22 cleanup P2 — wrap the prose column in an `lp-surface` "page"
   * card so the read view doesn't read as floating prose on a dark
   * void. Off by default so other consumers (deal memos, rider packs,
   * public share) keep their existing render until polished
   * individually. Hidden in print so the printout stays clean.
   */
  surface?: boolean;
};

export type DocumentCanvasBuilderProps = {
  mode: 'builder';
  aspectRatio?: number;
  /** Controlled zoom (1 = 100%). */
  zoom?: number;
  onZoomChange?: (zoom: number) => void;
  showGrid?: boolean;
  children: ReactNode;
  className?: string;
  /** Min height of surrounding viewport. */
  minHeight?: string;
};

export type DocumentCanvasProps = DocumentCanvasProseProps | DocumentCanvasBuilderProps;
