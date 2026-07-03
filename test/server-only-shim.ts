// Test shim for the `server-only` package.
//
// In the app, `server-only` is a build-time boundary guard: a no-op when a
// module lands in the server/RSC bundle, and a hard error when it lands in the
// client bundle (`next build` enforces this; Next aliases the bare specifier to
// its bundled copy). Vitest runs in a plain Node (server-like) context with no
// bundler to resolve the bare `server-only` specifier, so vitest.config.ts
// aliases it to this empty module — matching the server-side no-op. The
// client-side failure is verified by `next build`, not by unit tests.
export {};
