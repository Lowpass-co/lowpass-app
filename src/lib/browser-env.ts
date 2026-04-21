/* ============================================
   LOWPASS — Browser environment helpers

   Used by the floating bug report to collect useful
   client-side context (viewport, browser, os).
   ============================================ */

export type BrowserEnv = {
  pageUrl: string;
  pagePath: string;
  userAgent: string;
  browser: string;
  os: string;
  viewportWidth: number;
  viewportHeight: number;
  devicePixelRatio: number;
};

export function collectBrowserEnv(): BrowserEnv {
  if (typeof window === 'undefined') {
    return {
      pageUrl: '',
      pagePath: '',
      userAgent: '',
      browser: '',
      os: '',
      viewportWidth: 0,
      viewportHeight: 0,
      devicePixelRatio: 1,
    };
  }
  const ua = navigator.userAgent || '';
  return {
    pageUrl: window.location.href,
    pagePath: window.location.pathname,
    userAgent: ua,
    browser: parseBrowser(ua),
    os: parseOs(ua),
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio || 1,
  };
}

function parseBrowser(ua: string): string {
  if (/Edg\//i.test(ua)) return 'Edge';
  if (/OPR\/|Opera/i.test(ua)) return 'Opera';
  if (/Chrome\//i.test(ua) && !/Chromium/i.test(ua)) return 'Chrome';
  if (/Firefox\//i.test(ua)) return 'Firefox';
  if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) return 'Safari';
  return 'Unknown';
}

function parseOs(ua: string): string {
  if (/Windows NT 10/i.test(ua)) return 'Windows 10/11';
  if (/Windows NT/i.test(ua)) return 'Windows';
  if (/Mac OS X/i.test(ua)) return 'macOS';
  if (/Android/i.test(ua)) return 'Android';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS';
  if (/Linux/i.test(ua)) return 'Linux';
  return 'Unknown';
}
