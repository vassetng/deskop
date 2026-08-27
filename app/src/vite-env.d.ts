/// <reference types="vite/client" />

type DiscoveredServer = { name: string; address: string; port: number };

interface Window {
  deskop?: {
    notify: (title: string, body: string) => void;
    getOsUsername: () => Promise<string | null>;
    discoverServers: () => Promise<DiscoveredServer[]>;
  };
}
