// Vitest runs outside Next's bundler, where "next/server"'s package export
// map doesn't resolve the same way — stub it out. Unit tests only need the
// pure functions in document.service.ts, never the actual after()-scheduled
// OCR side effect.
export function after(fn: () => void | Promise<void>) {
  void fn;
}
