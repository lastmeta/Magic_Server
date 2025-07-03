// decodeTxHex.ts
const buffers = require("buffer");
(window as any).Buffer = buffers.Buffer; // Polyfill Buffer globally
// const process = require("process");
(window as any).process = {
  nextTick: (fn: any) => setTimeout(fn, 0),
  env: {},
  cwd: () => "/",
  version: "v20.11.0",
};

require("stream-browserify"); // Polyfill stream (no global assignment needed)

const evrmorejs = require("evrmorejs"); // Correct npm package import

function decodeTxHex(psbtHex: string) {
  try {
    const psbt = evrmorejs.Psbt.fromHex(psbtHex);
    const result = {
      isSuccess: true,
      data: {
        inputs: psbt.txInputs,
        outputs: psbt.txOutputs,
      },
    };
    return JSON.stringify(result);
  } catch (error: any) {
    return JSON.stringify({ isSuccess: false, error: error.message });
  }
}

// Expose to window for WebView
if (typeof window !== "undefined") {
  window.decodeTxHex = decodeTxHex;
}

module.exports = { decodeTxHex };
