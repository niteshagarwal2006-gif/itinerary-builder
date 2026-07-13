import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server build used by the desktop (Electron) app.
  output: "standalone",
  outputFileTracingRoot: __dirname,
  // Native module: must be require()d from node_modules at runtime, not
  // compiled into chunks (which bakes in build-machine absolute paths).
  serverExternalPackages: ["better-sqlite3"],
  // fs usage with cwd-relative paths makes the tracer hoover the project dir;
  // keep desktop build artifacts and repo junk out of the standalone bundle.
  outputFileTracingExcludes: {
    "/*": [
      "build/**",
      "release/**",
      "desktop-app/**",
      "build-res/**",
      "data/**",
      "scripts/**",
      ".git/**",
    ],
  },
};

export default nextConfig;
