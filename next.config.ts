import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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

export default nextConfig;
