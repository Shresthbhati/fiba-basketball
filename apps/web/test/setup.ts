import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length() { return this.data.size; }
  clear() { this.data.clear(); }
  getItem(key: string) { return this.data.get(key) ?? null; }
  key(index: number) { return Array.from(this.data.keys())[index] ?? null; }
  removeItem(key: string) { this.data.delete(key); }
  setItem(key: string, value: string) { this.data.set(key, String(value)); }
}

const memStorage = new MemoryStorage();
if (typeof window !== "undefined") {
  Object.defineProperty(window, "localStorage", {
    value: memStorage,
    configurable: true,
    writable: true,
  });
}
try {
  delete (globalThis as Record<string, unknown>).localStorage;
} catch { /* ignore */ }
Object.defineProperty(globalThis, "localStorage", {
  value: memStorage,
  configurable: true,
  writable: true,
});

afterEach(() => {
  cleanup();
});

