const fs = require("node:fs");
const path = require("node:path");

exports.default = async function afterPack(context) {
  const dest = path.join(context.appOutDir, "resources", "lurkwire-proxy");
  if (!fs.existsSync(dest)) {
    throw new Error(
      `bundled sidecar missing at ${dest}; run "npm run build:proxy" before packaging`,
    );
  }
  fs.chmodSync(dest, 0o755);
};
