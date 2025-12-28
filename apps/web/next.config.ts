import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config) => {
    // Webpack + the @supabase/supabase-js ESM wrapper.mjs currently conflict in this repo.
    // Force the CommonJS entrypoint everywhere so @supabase/ssr can bundle without errors.
    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      "@supabase/supabase-js": require.resolve("@supabase/supabase-js"),
    };

    return config;
  },
};

export default nextConfig;
