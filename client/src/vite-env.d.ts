/// <reference types="vite/client" />

import type { YuDuBidBridge } from './shared/types';

declare global {
  interface Window {
    yibiao?: YuDuBidBridge;
    yibiaoClient?: {
      appName: string;
      platform: string;
    };
  }
}

export {};
