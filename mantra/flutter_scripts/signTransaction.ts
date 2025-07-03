console.log("Buffer", typeof Buffer);
console.log("Before requiring dependencies");
const evrmore = require("evrmorejs");
const ECPairFactory = require("ecpair");
const ecc = require("@noble/secp256k1");
console.log("After requiring dependencies");

async function signTransaction(
  psbtHex: string,
  privateKeyWIF: string
): Promise<{ isSuccess: boolean; error?: string; hex?: string }> {
  const ECPair = ECPairFactory(ecc);
  //   const keyPair = ECPair.fromWIF(privateKeyWIF, evrmore.networks.evrmore);
  // Create ECPair from WIF
  const baseKeyPair = ECPair.fromWIF(privateKeyWIF, evrmore.networks.evrmore);

  // Convert to a Signer compatible with evrmorejs-lib
  const keyPair = {
    publicKey: Buffer.from(baseKeyPair.publicKey), // Convert Uint8Array to Buffer
    network: evrmore.networks.evrmore,
    sign: (hash: Buffer) => Buffer.from(baseKeyPair.sign(hash)), // Convert signature to Buffer
  };
  const signed = evrmore.Psbt.fromHex(psbtHex);

  try {
    await signed.signAllInputs(keyPair);
  } catch (e: any) {
    console.log("Error signing transaction: ", e);
    return {
      isSuccess: false,
      error: e.message,
    };
  }

  try {
    signed.finalizeAllInputs();
  } catch (error: any) {
    console.error("Error finalizing inputs:", error);
    return {
      isSuccess: false,
      error: error.message,
    };
  }
  const tx = signed.extractTransaction();

  return {
    isSuccess: true,
    hex: tx.toHex(),
  };
}
console.log("WINDOW", typeof window);
if (typeof window !== "undefined") {
  console.log("Setting window.signTransaction");
  window.signTransaction = signTransaction;
}

module.exports = { signTransaction };
