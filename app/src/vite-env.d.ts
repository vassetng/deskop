/// <reference types="vite/client" />

interface Window {
  deskop?: {
    notify: (title: string, body: string) => void;
  };
}
