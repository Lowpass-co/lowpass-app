'use client';

import type { ReactNode } from 'react';

/** Tbody container for the scrollable, optionally virtualized grid body. */
export function GridBody({ children }: { children: ReactNode }) {
  return <tbody>{children}</tbody>;
}
