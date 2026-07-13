#!/usr/bin/env node
/**
 * Build the Mac desktop app.
 *
 * Steps:
 *   1. next build (output: standalone)
 *   2. Assemble build/server = standalone + .next/static + public (minus uploads)
 *   3. Assemble build/seed   = data/library.db + public/uploads (first-run data)
 *   4. Rebuild better-sqlite3 for Electron's ABI, swap the binary into
 *      build/server, then restore the host build so `npm run dev` keeps working
 *   5. electron-builder → release/mac-arm64/Itinerary Builder.app
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const run = (cmd, opts = {}) =>
  execSync(cmd, { stdio: "inherit", cwd: root, ...opts });

const rm = (p) => fs.rmSync(p, { recursive: true, force: true });
const cp = (from, to, filter) =>
  fs.cpSync(from, to, { recursive: true, filter });

console.log("\n▸ 1/5  next build (standalone)…");
// Stale outputs poison the trace (build/ would get bundled into itself).
rm(path.join(root, ".next"));
rm(path.join(root, "build"));
rm(path.join(root, "release"));
run("npx next build");

console.log("\n▸ 2/5  assembling server bundle…");
const serverDir = path.join(root, "build", "server");
rm(path.join(root, "build"));
cp(path.join(root, ".next", "standalone"), serverDir);
cp(path.join(root, ".next", "static"), path.join(serverDir, ".next", "static"));
// public/ minus uploads — uploads are per-user data served from userData
cp(path.join(root, "public"), path.join(serverDir, "public"), (src) => {
  const rel = path.relative(path.join(root, "public"), src);
  return !rel.startsWith("uploads");
});

console.log("\n▸ 3/5  assembling seed data…");
const seedDir = path.join(root, "build", "seed");
fs.mkdirSync(seedDir, { recursive: true });
// .backup (not a file copy) — the DB runs in WAL mode, so a plain copy of
// library.db misses everything still sitting in the -wal sidecar.
run(`sqlite3 "${path.join(root, "data", "library.db")}" ".backup '${path.join(seedDir, "library.db")}'"`);
const uploadsSrc = path.join(root, "public", "uploads");
if (fs.existsSync(uploadsSrc)) cp(uploadsSrc, path.join(seedDir, "uploads"));

console.log("\n▸ 4/5  rebuilding better-sqlite3 for Electron…");
const napiPath = "node_modules/better-sqlite3/build/Release/better_sqlite3.node";
const hostBinary = path.join(root, napiPath);
// Backup must live OUTSIDE node_modules — electron-rebuild wipes build/Release.
const savedHost = path.join(root, "build", "better_sqlite3.host.node");
fs.copyFileSync(hostBinary, savedHost);
try {
  run("npx electron-rebuild -f -w better-sqlite3");
  const target = path.join(serverDir, napiPath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(hostBinary, target);
} finally {
  // Restore the host-ABI build so `npm run dev` keeps working.
  if (fs.existsSync(savedHost)) {
    fs.copyFileSync(savedHost, hostBinary);
    rm(savedHost);
  }
}

// Turbopack externals are absolute symlinks into .next/standalone — dead once
// the bundle moves. Replace each with a physical copy of the real module
// (done after the ABI swap so the copy carries the Electron binary).
console.log("\n▸ 4b/5  materializing turbopack external symlinks…");
const extDir = path.join(serverDir, ".next", "node_modules");
if (fs.existsSync(extDir)) {
  for (const entry of fs.readdirSync(extDir)) {
    const link = path.join(extDir, entry);
    if (!fs.lstatSync(link).isSymbolicLink()) continue;
    const pkgName = path.basename(fs.readlinkSync(link));
    fs.rmSync(link);
    cp(path.join(serverDir, "node_modules", pkgName), link);
    console.log(`   ${entry} → copy of node_modules/${pkgName}`);
  }
}

console.log("\n▸ 5/5  electron-builder…");
run("npx electron-builder --mac");

console.log("\n✔ Done → release/mac-arm64/Itinerary Builder.app");
