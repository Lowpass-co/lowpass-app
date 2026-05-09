'use client';

/* ============================================
   LOWPASS — <UploadDropZone> (Sprint 10 §5.4)

   Drag-and-drop wrapper for the personnel head shot + passport
   scan upload buttons. Wraps the existing click-to-pick button
   with HTML5 drag-and-drop handlers so the user can drop a
   file from Finder / a browser tab.

   Visual:
     - Resting: pass-through (caller's button shows as-is)
     - Hover with file: dashed orange border + slight bg tint
     - Drop: fires onFile with the first dropped file

   Wraps a single child. Caller still owns the file picker
   (input ref + click). This zone only adds the drag path.
   ============================================ */

import { useRef, useState, type ReactNode } from 'react';

interface UploadDropZoneProps {
  onFile: (file: File) => void;
  /** Optional MIME-type filter — drops with no matching file
   *  are ignored (consistent with the click-to-pick `accept`
   *  attribute on the underlying input). */
  accept?: ReadonlyArray<string>;
  children: ReactNode;
}

function matchesAccept(file: File, accept: ReadonlyArray<string>): boolean {
  if (accept.length === 0) return true;
  return accept.some((pattern) => {
    if (pattern.endsWith('/*')) {
      const prefix = pattern.slice(0, -1); // 'image/'
      return file.type.startsWith(prefix);
    }
    return file.type === pattern;
  });
}

export function UploadDropZone({ onFile, accept = [], children }: UploadDropZoneProps) {
  const [hovering, setHovering] = useState(false);
  /* Drag enter / leave fire on every nested element which
     causes flicker; track depth via a counter so leave only
     resets state when we exit the outer wrapper. */
  const dragDepthRef = useRef(0);

  return (
    <div
      onDragEnter={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return;
        dragDepthRef.current += 1;
        setHovering(true);
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        }
      }}
      onDragLeave={() => {
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
        if (dragDepthRef.current === 0) setHovering(false);
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        dragDepthRef.current = 0;
        setHovering(false);
        const file = e.dataTransfer.files[0];
        if (!file) return;
        if (!matchesAccept(file, accept)) return;
        onFile(file);
      }}
      style={{
        position: 'relative',
        borderRadius: 'var(--lp-radius-md)',
        outline: hovering
          ? '2px dashed var(--color-lp-orange)'
          : '2px dashed transparent',
        outlineOffset: 2,
        background: hovering
          ? 'color-mix(in srgb, var(--color-lp-orange) 6%, transparent)'
          : 'transparent',
        transition: 'background 120ms ease-out, outline-color 120ms ease-out',
      }}
    >
      {children}
      {hovering ? (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
            fontSize: 'var(--lp-text-xs)',
            fontWeight: 'var(--lp-weight-semibold)',
            color: 'var(--color-lp-orange)',
          }}
        >
          Drop to upload
        </div>
      ) : null}
    </div>
  );
}
