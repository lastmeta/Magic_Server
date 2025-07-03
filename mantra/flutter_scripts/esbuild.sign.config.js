// esbuild.sign.config.js
const esbuild = require("esbuild");
const nodePolyfills = require("esbuild-plugin-node-polyfills");
const { wasmLoader } = require("esbuild-plugin-wasm");

esbuild
  .build({
    entryPoints: ["signTransaction.ts"],
    bundle: true,
    outfile: "dist/signTransaction.bundle.js",
    platform: "browser",
    format: "esm", // Switch to ES Modules
    target: "esnext", // Keep for top-level await
    plugins: [nodePolyfills, wasmLoader({ mode: "embedded" })],
  })
  .then(() => console.log("Build succeeded"))
  .catch((error) => {
    console.error("Build failed:", error);
    process.exit(1);
  });
