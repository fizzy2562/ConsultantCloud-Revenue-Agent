/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    "@consultantcloud/agent-runtime",
    "@consultantcloud/revenue-mcp",
    "@consultantcloud/policy",
    "@consultantcloud/telemetry",
    "@consultantcloud/shared",
  ],
};

export default nextConfig;
