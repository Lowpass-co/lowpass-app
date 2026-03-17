'use client';

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

interface DetailPanelContextType {
  openLineItemId: string | null;
  openLineItem: (id: string) => void;
  closePanel: () => void;
}

const DetailPanelContext = createContext<DetailPanelContextType | null>(null);

export function DetailPanelProvider({ children }: { children: ReactNode }) {
  const [openLineItemId, setOpenLineItemId] = useState<string | null>(null);
  const openLineItem = useCallback((id: string) => setOpenLineItemId(id), []);
  const closePanel = useCallback(() => setOpenLineItemId(null), []);

  return (
    <DetailPanelContext.Provider
      value={{ openLineItemId, openLineItem, closePanel }}
    >
      {children}
    </DetailPanelContext.Provider>
  );
}

export function useDetailPanel(): DetailPanelContextType {
  const ctx = useContext(DetailPanelContext);
  if (!ctx) throw new Error('useDetailPanel must be used within DetailPanelProvider');
  return ctx;
}
