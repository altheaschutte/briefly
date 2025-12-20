/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  reactStrictMode: true,
  images: {
    // Disable the image optimizer while we rely on remote assets
    unoptimized: true
  }
};

export default nextConfig;
