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
    optimizePackageImports: [
      "lucide-react",
      "date-fns",
      "motion",
    ],
  },
  typescript: {
    // Hard-fail on type errors; strictness is a feature, not a hindrance.
    ignoreBuildErrors: false,
  },
};

// Wires the fumadocs-mdx codegen plugin into the Next build/dev pipeline.
const withMDX = createMDX();

export default withMDX(nextConfig);
