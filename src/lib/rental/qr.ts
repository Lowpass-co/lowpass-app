/* ============================================
   LOWPASS — rental QR generation (Sprint 12 §2)

   Pure server-side SVG generation for rental_inventory QR
   labels. We render to SVG (not PNG) because:

     1. No native deps required. The qrcode package's SVG path
        is pure-JS — no node-canvas / sharp / native binding to
        wrestle with in a Next 16 server build.
     2. SVG composites the centre logo cleanly via simple string
        manipulation — no canvas, no pixel grid alignment.
     3. P-touch Editor (Adam's Brother PTouch labelling app on
        Mac) imports SVG directly; the operator can resize for
        24mm / 12mm / 9mm tape without resolution loss.
     4. Browsers print SVG at any DPI the printer supports — no
        "this is 384px wide, will it pixelate on a 300dpi label"
        guesswork.

   Error correction is fixed at "H" (~30% data recovery). The
   centre logo blocks roughly 14% of the modules; H comfortably
   absorbs that. We white-background-pad the logo so the QR
   reader's finder pattern stays unambiguous around its edge.

   The scan target URL is built from QR_BASE_HOST + qr_token. In
   production this resolves to https://lowpass.co/rental/scan?t=…;
   in dev the env var stays unset and we fall back to the host
   header of the request. The Phase 3 scan UI lives at
   /rental/scan?t=… and will pre-select the item before showing
   the scan-in / scan-out / repair bottom-sheet.
   ============================================ */

import QRCode from 'qrcode';

/** Hex+alpha-safe brand orange. Mirrors var(--color-lp-orange)
 *  in the runtime tokens; defined as a literal here because
 *  the SVG is generated server-side, outside the CSS cascade. */
const LP_ORANGE = '#FF4500';

/* The fraction of total QR side length the centre logo occupies
   (including its white pad). 0.22 = ~22% — well within the H
   error-correction tolerance and small enough not to swamp the
   data modules around the centre alignment pattern. */
const LOGO_FRACTION = 0.22;

/** Build the URL encoded into the QR. The scan handler at
 *  /rental/scan?t=<token> looks up the inventory item by
 *  qr_token within the caller's workspace. */
export function buildScanUrl(qrToken: string, origin: string): string {
  return `${origin.replace(/\/$/, '')}/rental/scan?t=${encodeURIComponent(qrToken)}`;
}

interface RenderOptions {
  /** Pixel size (square) of the rendered SVG's intrinsic
   *  viewBox. Doesn't affect physical print size — the printer
   *  scales SVG losslessly. Default 256 is large enough for the
   *  modules to render cleanly in browser preview. */
  size?: number;
}

/** Render a rental_inventory item's QR token to a self-
 *  contained SVG string with the Lowpass orange centre dot
 *  overlaid. Caller wraps in an HTTP response with
 *  `image/svg+xml`. */
export async function renderRentalQrSvg(
  qrToken: string,
  origin: string,
  opts: RenderOptions = {},
): Promise<string> {
  const size = opts.size ?? 256;
  const payload = buildScanUrl(qrToken, origin);

  /* qrcode.toString returns a full <svg> document at the H
     error-correction level, with the data modules drawn as a
     single <path>. No frame, no margin — we ask for a 1-module
     margin so the finder patterns aren't flush against the
     edge. The shape="crispEdges" rendering style keeps QR
     modules sharp at any print resolution. */
  const baseSvg = await QRCode.toString(payload, {
    type: 'svg',
    errorCorrectionLevel: 'H',
    margin: 1,
    width: size,
    color: {
      dark: '#000000',
      light: '#ffffff',
    },
  });

  /* Inject the centre logo. The baseSvg's viewBox is 0 0 W W
     where W is the module count + 2 (for the 1-module margin).
     We parse W out of the viewBox attribute and compute the
     logo's centre + radius in viewBox units, then append our
     overlay before the closing </svg>. */
  const viewBoxMatch = baseSvg.match(/viewBox="(\d+)\s+(\d+)\s+(\d+)\s+(\d+)"/);
  if (!viewBoxMatch) {
    /* If qrcode ever changes its output shape, fall back to the
       plain QR rather than failing the request — a logo-less QR
       still scans correctly. */
    return baseSvg;
  }
  const vbW = Number(viewBoxMatch[3]);
  const vbH = Number(viewBoxMatch[4]);
  const cx = vbW / 2;
  const cy = vbH / 2;
  const logoR = (Math.min(vbW, vbH) * LOGO_FRACTION) / 2;
  /* White pad ring slightly larger than the orange dot so the
     QR scanner sees a clean boundary around the logo, regardless
     of which data modules happen to land there. */
  const padR = logoR * 1.15;

  const overlay =
    `<rect x="${cx - padR}" y="${cy - padR}" width="${padR * 2}" height="${padR * 2}" fill="#ffffff" />` +
    `<circle cx="${cx}" cy="${cy}" r="${logoR}" fill="${LP_ORANGE}" />`;

  return baseSvg.replace('</svg>', `${overlay}</svg>`);
}
