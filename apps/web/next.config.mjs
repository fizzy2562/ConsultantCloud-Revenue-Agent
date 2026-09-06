/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  transpilePackages: [
    "@consultantcloud/agent-runtime",
    "@consultantcloud/revenue-mcp",
    "@consultantcloud/policy",
    "@consultantcloud/telemetry",
    "@consultantcloud/shared",
  ],
};

export default nextConfig;
