import type { NextConfig } from "next";

const config: NextConfig = {
  // The agent code only ever runs on the server
  serverExternalPackages: ["@celo/buy-core"],
};

export default config;
