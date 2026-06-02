/* ============================================
   LOWPASS — <StagePlotIcon> render primitive (§SP1a·1)

   Renders one IconDescriptor in either palette (library) or
   on-canvas mode from a SINGLE authored SVG source. Mode +
   CSS vars drive fill/stroke (see the .lp-stage-icon rules in
   globals.css); the authored body carries no colour attrs.

   - library: monochrome outline, currentColor = text-secondary,
     optional category badge chip.
   - canvas: closed shapes flood-filled with the brand tint,
     stroked in the category hue, sized to the footprint in px.

   Strokes use non-scaling-stroke (globals.css) so 1.5/1.75px
   holds at any size or canvas zoom.

   NOTE: icon.body is trusted (hand-authored registry constants).
   Custom/AI icons (§SP10/§SP11) must be sanitised before they
   reach this primitive.
   ============================================ */
'use client';

import type { CSSProperties } from 'react';
import { getCategory } from '@/lib/stage-plot/icons/categories';
import {
  ICON_VIEWBOX,
  ICON_STROKE_LIBRARY,
  ICON_STROKE_CANVAS,
  ICON_BRAND_TINT_PCT,
  type IconDescriptor,
  type IconRenderMode,
} from '@/lib/stage-plot/icons/types';

/** --lp-orange. The brand-colour cascade resolves the real value
 *  upstream (§SP6); this is the workspace-default fallback. */
const DEFAULT_BRAND = '#FF4500';

export interface StagePlotIconProps {
  icon: IconDescriptor;
  mode?: IconRenderMode;
  /** Library square size in px. */
  size?: number;
  /** Canvas footprint render box in px (overrides size). */
  widthPx?: number;
  heightPx?: number;
  /** Canvas fill tint source — hex or any CSS colour. */
  brandColor?: string;
  /** Category badge chip. Defaults on in library, off on canvas. */
  showBadge?: boolean;
  selected?: boolean;
  /** Overrides the aria-label (defaults to the icon label). */
  title?: string;
  className?: string;
}

export function StagePlotIcon({
  icon,
  mode = 'library',
  size = 32,
  widthPx,
  heightPx,
  brandColor = DEFAULT_BRAND,
  showBadge,
  selected,
  title,
  className,
}: StagePlotIconProps) {
  const category = getCategory(icon.category);
  const isCanvas = mode === 'canvas';
  const w = isCanvas ? widthPx ?? size : size;
  const h = isCanvas ? heightPx ?? size : size;

  const style = {
    width: w,
    height: h,
    '--ico-stroke-w': isCanvas ? ICON_STROKE_CANVAS : ICON_STROKE_LIBRARY,
  } as CSSProperties & Record<string, string | number>;

  if (isCanvas) {
    style['--ico-fill'] = icon.outline
      ? 'none'
      : `color-mix(in srgb, ${brandColor} ${ICON_BRAND_TINT_PCT}%, transparent)`;
    style['--ico-stroke'] = category.colorVar;
  } else {
    style.color = selected ? 'var(--lp-text)' : 'var(--lp-text-secondary)';
  }

  const withBadge = showBadge ?? mode === 'library';

  return (
    <span
      className={`lp-stage-icon${className ? ` ${className}` : ''}`}
      data-mode={mode}
      data-category={icon.category}
      style={style}
      role="img"
      aria-label={title ?? icon.label}
    >
      <svg
        viewBox={icon.viewBox ?? ICON_VIEWBOX}
        preserveAspectRatio="xMidYMid meet"
        focusable="false"
        dangerouslySetInnerHTML={{ __html: icon.body }}
      />
      {withBadge ? (
        <span className="lp-stage-icon__badge" style={{ background: category.colorVar }} aria-hidden="true">
          {category.badge}
        </span>
      ) : null}
    </span>
  );
}
