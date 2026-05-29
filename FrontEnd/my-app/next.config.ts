import type { NextConfig } from 'next';
import { cspHeaders } from './next.config.csp';

const nextConfig: NextConfig = {
  async headers() {
    return cspHeaders;
  },
};
import type { NextConfig } from "next";
import withBundleAnalyzer from "@next/bundle-analyzer";

const withAnalyzer = withBundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

const nextConfig: NextConfig = {};

export default withAnalyzer(nextConfig);