/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    serverComponentsExternalPackages: ["oidc-provider", "pg"],
    outputFileTracingIncludes: {
      "/developers/guide": ["./docs/DEVELOPER_GUIDE.md"],
    },
  },
};

export default nextConfig;
