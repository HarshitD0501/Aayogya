/** @type {import('next').NextConfig} */

// Proxy /api/* to the FastAPI backend so the browser talks same-origin (no CORS).
// Override the target with BACKEND_ORIGIN in .env.local when the backend isn't local.
const BACKEND = process.env.BACKEND_ORIGIN || "http://127.0.0.1:8000";
// The voice/chat agent (System B, `uvicorn chat:app --port 8080`) lives on its own
// origin; proxy /agent/* to it so the Assistant section stays same-origin too.
const AGENT = process.env.AGENT_ORIGIN || "http://127.0.0.1:8080";

const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${BACKEND}/api/:path*` },
      { source: "/agent/:path*", destination: `${AGENT}/:path*` },
    ];
  },
};

export default nextConfig;
