'use client';

import { createContext, useContext } from 'react';

export interface KioskValue {
  kiosk: boolean;
  setKiosk: (on: boolean) => void;
}

export const KioskContext = createContext<KioskValue>({ kiosk: false, setKiosk: () => {} });

export const useKiosk = () => useContext(KioskContext);
