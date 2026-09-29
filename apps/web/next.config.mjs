/** @type {import('next').NextConfig} */
const nextConfig = {
  // "standalone" output is for the Docker image (see ../../Dockerfile) and is
  // incompatible with Vercel's own build/trace pipeline, so skip it there.
  output: process.env.VERCEL ? undefined : "standalone",
  transpilePackages: [
    "@consultantcloud/agent-runtime",
    "@consultantcloud/revenue-mcp",
    "@consultantcloud/policy",
    "@consultantcloud/telemetry",
    "@consultantcloud/shared",
    "@revenue-picker/core",
    "@revenue-picker/salesforce-revenue",
  ],
};

export default nextConfig;
