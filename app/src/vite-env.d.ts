/// <reference types="vite/client" />

type DiscoveredServer = { name: string; address: string; port: number };
type ScreenSource = { id: string; name: string; thumbnail: string | null };

interface Window {
  deskop?: {
    notify: (title: string, body: string) => void;
    getOsUsername: () => Promise<string | null>;
    discoverServers: () => Promise<DiscoveredServer[]>;
    getScreenSources: () => Promise<ScreenSource[]>;
    getActiveApp: () => Promise<string | null>;
    getIdleSeconds: () => Promise<number>;
  };
}
