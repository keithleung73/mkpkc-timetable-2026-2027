import type { NextConfig } from "next";

const isGithubPages = process.env.GITHUB_PAGES === "true";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "/mkpkc-timetable-2026-2027";

const nextConfig: NextConfig = {
  ...(isGithubPages
    ? {
        output: "export" as const,
        basePath,
        assetPrefix: basePath,
        trailingSlash: true,
        images: { unoptimized: true },
      }
    : {}),
  allowedDevOrigins: [
    "127.0.0.1",
    "localhost",
    "timetable.mkpkc.local",
    "mkpkc.local",
    "10.118.1.171",
    "*.trycloudflare.com",
    "*.loca.lt",
    "*.localhost.run",
  ],
  serverExternalPackages: ["pdfkit", "fontkit"],
};

export default nextConfig;
