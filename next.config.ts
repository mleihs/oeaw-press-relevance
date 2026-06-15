import type { NextConfig } from "next";
import { createMDX } from "fumadocs-mdx/next";

const nextConfig: NextConfig = {
  // Self-hosting (Coolify/Docker): emit a minimal standalone server bundle at
  // .next/standalone. Vercel ignores this (it uses its own Build Output API),
  // so it is safe for both deploy targets.
  output: "standalone",

  // React 19 strict-mode is on by default; nothing extra needed for that.
  experimental: {
    // Tree-shake heavy icon/util barrels — material bundle reduction on Dashboard
    // and table pages where lucide-react / date-fns / motion get imported wide.
    // radix-ui (the unified meta-package) + recharts are wide barrels too.
    optimizePackageImports: [
      "lucide-react",
      "date-fns",
      "motion",
      "radix-ui",
      "recharts",
    ],
  },
  typescript: {
    // Hard-fail on type errors; strictness is a feature, not a hindrance.
    ignoreBuildErrors: false,
  },
  // Baseline security headers, applied to every response. The CSP is deliberately
  // scoped to the directives that don't constrain script/style/img/connect
  // loading (frame-ancestors / object-src / base-uri / form-action) so it hardens
  // clickjacking + base-tag/object injection without risking a broken hydration
  // bundle behind the gate. The classic headers below are pure-win.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'",
          },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
};

// Wires the fumadocs-mdx codegen plugin into the Next build/dev pipeline.
const withMDX = createMDX();

export default withMDX(nextConfig);
