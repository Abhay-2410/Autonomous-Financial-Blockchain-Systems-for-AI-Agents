/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Amplify Hosting (Next.js SSR) — do not set output: 'export'
  env: {
    NEXT_PUBLIC_API_URL:
      process.env.NEXT_PUBLIC_API_URL ??
      "https://gaq4ipibk8.execute-api.eu-north-1.amazonaws.com/dev",
  },
};

module.exports = nextConfig;
