import "server-only";

import os from "node:os";

export const SHARE_PORT = 43217;

export function lanHttpUrls(port = SHARE_PORT): string[] {
  const urls = new Set<string>();
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const addr of addrs ?? []) {
      const family = String(addr.family);
      if (family !== "IPv4" && family !== "4") continue;
      if (addr.internal) continue;
      urls.add(`http://${addr.address}:${port}`);
    }
  }
  return [...urls];
}
