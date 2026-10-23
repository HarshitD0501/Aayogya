/** @type {import('next').NextConfig} */

// The voice/chat agent (System B, `uvicorn chat:app --port 8081`) lives on its own
// origin; proxy /agent/* to it so the Assistant section stays same-origin too.
const AGENT = process.env.AGENT_ORIGIN || "http://127.0.0.1:8081";

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
