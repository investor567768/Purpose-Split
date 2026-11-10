// Bundles wallet-entry.js into ../web/vendor/wallet.js and copies the modal styles.
import { build } from "esbuild";
import fs from "node:fs";
fs.mkdirSync("../web/vendor", { recursive: true });
await build({
  entryPoints: ["wallet-entry.js"],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2020",
  minify: true,
  outfile: "../web/vendor/wallet.js",
  define: { "process.env.NODE_ENV": '"production"', global: "globalThis" },
  legalComments: "linked",
  inject: ["shims.js"],
  logLevel: "warning",
});
fs.copyFileSync("node_modules/@near-wallet-selector/modal-ui/styles.css", "../web/vendor/wallet.css");
console.log("built web/vendor/wallet.js", fs.statSync("../web/vendor/wallet.js").size, "bytes");
