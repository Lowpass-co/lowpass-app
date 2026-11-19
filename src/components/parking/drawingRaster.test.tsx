import { describe, expect, it } from 'vitest';
import { invertLightness, paperToAlpha } from './drawingRaster';

describe('inside drawings on screen: lines on a clear background', () => {
  it('paper goes clear, black and coloured lines stay solid, pale hatching is faint', () => {
    // white paper, black line, red line, light-grey hatching
    const original = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255, 255, 0, 0, 255, 220, 220, 220, 255]);
    const dark = new Uint8ClampedArray(original);
    invertLightness(dark);
    paperToAlpha(dark, original);
    const alpha = [dark[3], dark[7], dark[11], dark[15]];
    expect(alpha).toEqual([0, 255, 255, 35]);
    // the line is drawn light (inverted), so it shows on the dark map
    expect([dark[4], dark[5], dark[6]]).toEqual([255, 255, 255]);
    // a red line stays red
    expect([dark[8], dark[9], dark[10]]).toEqual([255, 0, 0]);
  });
});
