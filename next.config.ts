import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
