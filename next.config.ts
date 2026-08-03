import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  async redirects() {
    return [
      {
        source: "/",
        destination: "/hoy",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
