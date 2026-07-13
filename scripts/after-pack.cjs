/**
 * electron-builder afterPack hook.
 * Copies the Next.js standalone server bundle into Contents/Resources/server
 * ourselves — electron-builder's extraResources copier silently drops
 * node_modules, which the server needs at runtime.
 */
const fs = require("node:fs");
const path = require("node:path");

exports.default = async function afterPack(context) {
  const src = path.join(context.packager.projectDir, "build", "server");
  const resources = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
    "Contents",
    "Resources"
  );
  const dest = path.join(resources, "server");
  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(src, dest, { recursive: true });
  console.log(`  • afterPack: copied server bundle → ${dest}`);
};
