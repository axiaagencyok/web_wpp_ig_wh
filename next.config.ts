import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["twilio", "googleapis"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "api.twilio.com",
      },
      {
        protocol: "https",
        hostname: "*.supabase.co",
      },
    ],
  },
};

export default nextConfig;
