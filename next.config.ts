import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "@prisma/client",
    "@prisma/adapter-pg",
    "pg",
    "pdf-parse",
    "bcryptjs",
    "tesseract.js",
    "tesseract.js-core",
    "@napi-rs/canvas",
  ],
  // tesseract.js-core@7 dropped its asm.js fallback files but left the
  // conditional require() pointing at them — dead code at runtime (Node
  // always has WebAssembly), but Turbopack still tries to statically resolve
  // it and fails since the file no longer exists. Redirect it to the real
  // (WASM) module so resolution succeeds; the branch never actually runs.
  turbopack: {
    resolveAlias: {
      "./tesseract-core.asm": "tesseract.js-core/tesseract-core.js",
    },
  },
  // Turbopack's dev filesystem cache grew past 800MB over this long-running
  // session and started spending 30s–2min per request on "cache database
  // compaction" — during which every request (even a trivial unread-count
  // query) stalled behind it. This project is small enough that the cache's
  // cold-compile savings aren't worth that recurring stall; disabling it
  // keeps response times consistent instead of periodically falling off a cliff.
  experimental: {
    turbopackFileSystemCacheForDev: false,
    // Bawaan Next.js membatasi body request ke 10MB di level proxy/middleware,
    // jauh di bawah MAX_UPLOAD_SIZE_BYTES (200MB) yang divalidasi di route
    // upload — tanpa ini, berkas di atas ~10MB gagal (formData() rusak parse)
    // sebelum kode aplikasi sempat menolaknya dengan pesan yang jelas.
    proxyClientMaxBodySize: 200 * 1024 * 1024,
  },
};

export default nextConfig;
