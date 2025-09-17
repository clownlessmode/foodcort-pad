/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: "/grill-terminal",
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
