import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const apiUrl = process.env.API_URL ?? "http://localhost:4000";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@mimitales/shared"],
  poweredByHeader: false,
  outputFileTracingRoot: path.join(here, "../.."),
  async rewrites() {
    // Browser talks to /api/*; Next forwards it to the Fastify API.
    return [{ source: "/api/:path*", destination: `${apiUrl}/:path*` }];
  },
};

export default nextConfig;