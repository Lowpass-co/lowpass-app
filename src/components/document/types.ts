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
