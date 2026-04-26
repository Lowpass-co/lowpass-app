'use client';

import { DocumentCanvasProse } from './DocumentCanvasProse';
import { DocumentCanvasBuilder } from './DocumentCanvasBuilder';
import type { DocumentCanvasProps } from './types';

export function DocumentCanvas(props: DocumentCanvasProps) {
  if (props.mode === 'prose') {
    return <DocumentCanvasProse {...props} />;
  }
  return <DocumentCanvasBuilder {...props} />;
}

export type { DocumentCanvasProseProps, DocumentCanvasBuilderProps, DocumentCanvasProps } from './types';
