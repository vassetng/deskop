import path from "path";
import { fileURLToPath } from "url";

// Inside a pkg-packaged binary, `process.pkg` is set and files bundled into
// the snapshot are read-only — data that needs to be written (or replaced,
// like the public/ folder) must live next to the actual .exe instead.
export const isPackaged = !!process.pkg;

// Lazy: `import.meta.url` is empty once esbuild bundles this to CJS for
// packaging, but the ternary below short-circuits so this never actually
// runs in that build — only reference it, never call it, outside dev mode.
function devBaseDir() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  return path.join(__dirname, "..");
}

export const baseDir = isPackaged ? path.dirname(process.execPath) : devBaseDir();

export function serverPath(...segments) {
  return path.join(baseDir, ...segments);
}
