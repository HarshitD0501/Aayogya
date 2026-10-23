/** @type {import('next').NextConfig} */

// The standalone voice demo exposes /token on port 8080; proxy that fallback.
const AGENT = process.env.AGENT_ORIGIN || "http://127.0.0.1:8080";

const nextConfig = {
  reactStrictMode: true,
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = [...(config.externals || []), "leaflet"];
    }
    return config;
  },
  async rewrites() {
    return [
      { source: "/agent/:path*", destination: `${AGENT}/:path*` },
    ];
  },
};

export default nextConfig;
