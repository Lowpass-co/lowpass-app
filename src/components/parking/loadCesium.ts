'use client';

/* Load CesiumJS at runtime from /cesium (copied there by
   scripts/copy-cesium.mjs). Not bundled: Cesium fetches its own workers and
   assets from CESIUM_BASE_URL, and it is several MB — only the 3D page and the
   PDF's page 2 pay for it. Types come from the `cesium` package. */

import type * as CesiumNS from 'cesium';

export type CesiumModule = typeof CesiumNS;

declare global {
  interface Window {
    Cesium?: CesiumModule;
    CESIUM_BASE_URL?: string;
  }
}

let loading: Promise<CesiumModule> | null = null;

export function loadCesium(): Promise<CesiumModule> {
  if (typeof window === 'undefined') return Promise.reject(new Error('3D needs a browser'));
  if (window.Cesium) return Promise.resolve(window.Cesium);
  if (loading) return loading;
  window.CESIUM_BASE_URL = '/cesium/';
  loading = new Promise<CesiumModule>((resolve, reject) => {
    if (!document.querySelector('link[data-cesium]')) {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = '/cesium/Widgets/widgets.css';
      css.dataset.cesium = '1';
      document.head.appendChild(css);
    }
    const s = document.createElement('script');
    s.src = '/cesium/Cesium.js';
    s.async = true;
    s.onload = () => (window.Cesium ? resolve(window.Cesium) : reject(new Error('The 3D engine loaded but did not start')));
    s.onerror = () => {
      loading = null;
      reject(new Error('The 3D engine failed to load'));
    };
    document.head.appendChild(s);
  });
  return loading;
}
