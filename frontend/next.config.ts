import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Needed by the production image: bundles the server with only the modules
  // it actually imports, instead of shipping the whole dependency tree.
  output: "standalone",

  // This app renders somebody's records on every page. None of it belongs in
  // a shared cache or a search index, and the headers say so at the edge
  // rather than relying on each page to remember.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
};

export default nextConfig;
