import type { NextConfig } from 'next';
import { cspHeaders } from './next.config.csp';

const nextConfig: NextConfig = {
  async headers() {
    return cspHeaders;
  },
};

export default nextConfig;