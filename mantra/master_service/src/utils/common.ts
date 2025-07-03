import * as evrmore from 'evrmorejs-lib';
import * as crypto from 'crypto';
import * as bip32 from 'bip32';
import * as ecc from 'tiny-secp256k1';
import * as bitcoinjs from 'bitcoinjs-lib';
import bs58 from 'bs58';
import { createHash } from 'crypto';
import { RedisClientOptions } from 'redis';

export const makeRequest = (method, params, id) => {
  return JSON.stringify({
    jsonrpc: '2.0',
    method: method,
    params: params,
    id: id
  });
};
export const connections = [
  '128.199.1.149:50002',
  '146.190.149.237:50002',
  '146.190.38.120:50002',
  'electrum1-mainnet.evrmorecoin.org:50002',
  'electrum2-mainnet.evrmorecoin.org:50002'
];
export enum ScriptType {
  P2PK = 'P2PK',
  P2SH = 'P2SH',
  P2PKH = 'P2PKH'
}

export const REDIS_CONFIG: RedisClientOptions = {
  url: `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || '6379'}`,
  // If you have password:
  password: process.env.REDIS_PASSWORD
};
export const generateRandomNumberString = (length: number = 5): string => {
  let result = '';
  const characters = '0123456789';
  const charactersLength = characters.length;

  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }

  return result;
};
export const getPubkey = (xpubkey: any, index?: string) => {
  let pubkey;
  if (typeof xpubkey === 'string') {
    if (xpubkey.startsWith('0')) {
      return {
        pubkey: Buffer.from(xpubkey, 'hex'),
        xpubKey: xpubkey
      };
    } else {
      const node = bip32.BIP32Factory(ecc).fromBase58(xpubkey, evrmoreNetwork());

      if (index) {
        // Derive child key
        const derivedNode = node.derive(parseInt(index));
        pubkey = Buffer.from(derivedNode.publicKey);
        return {
          pubkey,
          xpubKey: derivedNode.toBase58()
        };
      } else {
        pubkey = Buffer.from(node.publicKey);
        return {
          pubkey,
          xpubKey: node.toBase58()
        };
      }
    }
  } else {
    return {
      pubkey: Buffer.from(xpubkey, 'hex'),
      xpubKey: xpubkey
    };
  }
};

export const evrmoreNetwork = (index?: string) => {
  let derivationAccountPath = "m/44'/175'/0'";
  if (index) {
    derivationAccountPath += `/${index}`;
  }
  return {
    messagePrefix: '\x15Evrmore Signed Message:\n',
    bech32: 'ev',
    bip32: {
      public: 0x0488b21e,
      private: 0x0488ade4
    },
    pubKeyHash: 33,
    scriptHash: 92,
    wif: 0x80,
    derivationAccountPath
  };
};

export const getDerivedData = async (xpubkey: any, index?: string) => {
  try {
    const pubkey = getPubkey(xpubkey, index);
    const network = evrmoreNetwork(index);

    // const node = evrmore.BIP32Factory(ecc).fromBase58(xpubkey, network);
    // console.log('abc', node.publicKey.toString('hex'));

    const { address } = evrmore.payments.p2pkh({
      pubkey: pubkey.pubkey,
      network
    });

    const scriptPubKey = evrmore.payments.p2pkh({
      address,
      network
    }).output;
    const sha256Hash = crypto.createHash('sha256').update(scriptPubKey).digest();
    const scripthash = Buffer.from(sha256Hash.reverse()).toString('hex');

    return { pubkey, address, scripthash };
  } catch (e) {
    console.log('Error:- getDerivedData', e);
    throw e;
  }
};

export const getPublicKeyFromMnemonic = async (mnemonic: string): Promise<string> => {
  try {
    // Validate mnemonic
    if (!evrmore.bip39.validateMnemonic(mnemonic)) {
      throw new Error('Invalid mnemonic phrase');
    }

    // Generate seed from mnemonic
    const seed = await evrmore.bip39.mnemonicToSeed(mnemonic);

    // Create master node from seed
    const masterNode = bip32.BIP32Factory(ecc).fromSeed(seed, evrmoreNetwork());

    // Derive the master public key (m/44'/175'/0')
    const derivedNode = masterNode.derivePath("m/44'/175'/0'");

    // Get the extended public key (xpub)
    const xpub = derivedNode.neutered().toBase58();

    return xpub;
  } catch (error) {
    console.error('Error converting mnemonic to public key:', error);
    throw error;
  }
};

export const getPrivateKeyFromMnemonic = async (mnemonic: string) => {
  try {
    // Create seed from mnemonic
    const bip32Instance = bip32.BIP32Factory(ecc);
    const network: bitcoinjs.Network = evrmoreNetwork();

    // Convert mnemonic to seed
    const seed = evrmore.bip39.mnemonicToSeedSync(mnemonic);

    // Generate master node from seed
    const masterNode = bip32Instance.fromSeed(seed, network);

    // Derive the first private key (you can adjust the derivation path as needed)
    const child = masterNode.derivePath("m/44'/175'/0'/0/0");

    // Get private key in WIF format
    const privateKey = child.toWIF();

    return privateKey;
  } catch (e) {
    console.log('Error converting mnemonic to private key:', e);
    throw e;
  }
};

export const getInputType = (script: Buffer): string => {
  // const scriptHex = script.toString('hex');
  // console.log('scriptHex', scriptHex);

  // if (scriptHex.startsWith('76a914') && scriptHex.endsWith('88ac')) {
  //   return 'p2pkh'; // Pay-to-PubKeyHash
  // } else if (scriptHex.startsWith('4104') && scriptHex.endsWith('ac')) {
  //   return 'p2pk'; // Pay-to-PubKey
  // }
  // return 'unknown'; // Unknown type

  // Check if it's a P2PK
  if (script.length === 65 && script[script.length - 1] === 0xac) {
    // 65 bytes: <public_key> OP_CHECKSIG
    return 'P2PK'; // OP_CHECKSIG with a public key
  }

  if (
    // script.length >= 25 &&
    script[0] === 0x76 &&
    script[1] === 0xa9 &&
    script[2] === 0x14 &&
    script.includes(0x88) &&
    script.includes(0xac)
  ) {
    // OP_DUP OP_HASH160 <pubkey_hash> OP_EQUALVERIFY OP_CHECKSIG (with possible additional data)
    return 'P2PKH'; // This allows for extra data beyond the 25-byte standard length
  }
  // Check if it's a P2SH (Pay-to-Script-Hash)
  if (script.length === 23 && script[0] === 0xa9 && script[1] === 0x14 && script[22] === 0x87) {
    // 23 bytes: OP_HASH160 <script_hash> OP_EQUAL
    return 'P2SH'; // OP_HASH160 <script_hash> OP_EQUAL
  }

  // You can add more types here like P2WPKH, P2WSH, etc. if needed.

  return 'Unknown';
};

export const validateInput = (input): boolean => {
  // Check if the hash is a valid hex string
  if (!/^[0-9a-f]{64}$/.test(input.hash.toString('hex'))) {
    console.error(`Invalid transaction hash: ${input.hash.toString('hex')}`);
    return false;
  }
  // Check if the index is a non-negative integer
  if (typeof input.index !== 'number' || input.index < 0) {
    console.error(`Invalid index: ${input.index}`);
    return false;
  }
  // Additional checks can be added here
  return true;
};

export const lengthOfVarInt = (cnt: number): number => {
  if (cnt < 0xfd) return 1;
  if (cnt <= 0xffff) return 2;
  if (cnt <= 0xffffffff) return 5;
  return 9;
};

export const estimateFeeForFeerate = (weight: number, feeRateKB: number): number => {
  const feeRateByte = feeRateKB / 1000;
  const roundedFeeRate = parseFloat(feeRateByte.toFixed(1));
  const fee = Math.round((weight / 4.0) * roundedFeeRate);
  return fee;
};

export const sizeForVin = (elem): number => {
  try {
    // final lockingScriptType = LockingScriptType.values[vout.lockingScriptType];
    switch (elem.inputType) {
      case ScriptType.P2PK:
        // guess 72 bytes for DER encoded ECDSA sig + sig type + 1 byte op_push length + txid + idx + sequence
        return 74 + 32 + 4 + 4;
      case ScriptType.P2PKH:
        // guess 72 bytes for DER encoded ECDSA sig + sig type + 1 byte op_push length
        // + guess compressed 33 byte public key + 1 byte op_push length + + txid + idx + sequence
        return 108 + 32 + 4 + 4;
      default:
        // We have no way of knowing how large the p2sh sig is unless we only support
        // standardized multisig or something
        throw new Error('$lockingScriptType is not currently handled');
    }
    // // return 108 + 32 + 4 + 4;
    // return 74 + 32 + 4 + 4;
  } catch (_) {
    throw new Error('unknown locking script type: ${vout.lockingScriptType}');
  }
};

export const getVinLockingScriptType = (type): number => {
  switch (type) {
    case ScriptType.P2PKH:
      return 0;
    case ScriptType.P2SH:
      return 1;
    case ScriptType.P2PK:
      return 2;
    default:
      return -1;
  }
};

export const getMasterFingerprint = (xpub: string): string => {
  const hash = crypto.createHash('sha256').update(Buffer.from(xpub, 'hex')).digest();
  const masterFingerprint = hash.subarray(0, 4);
  console.log('masterFingerprint', masterFingerprint.toString());

  return masterFingerprint.toString('hex');
};

export const getElectrumConnectionString = (scriptHash: string): string => {
  let connectionString: string;
  if (!global.connectionResult?.length) {
    connectionString = connections[0];
    global.connectionResult = [
      {
        connectionString,
        scriptHashes: [scriptHash],
        count: 1
      }
    ];
  } else {
    const findConnectionIndex = global.connectionResult.findIndex((connection) =>
      connection.scriptHashes.includes(scriptHash)
    );
    if (findConnectionIndex >= 0) {
      const findConnection = global.connectionResult[findConnectionIndex];
      if (findConnection.count < 1000) {
        connectionString = findConnection.connectionString;
        global.connectionResult[findConnectionIndex].count++;
        global.connectionResult[findConnectionIndex].scriptHashes = [
          ...findConnection.scriptHashes,
          scriptHash
        ];
      } else {
        const newConnectionIndex = global.connectionResult.findIndex(
          (connection) => connection.count < 1000
        );
        if (newConnectionIndex >= 0) {
          const newConnection = global.connectionResult[newConnectionIndex];
          connectionString = newConnection.connectionString;
          global.connectionResult[newConnectionIndex].count++;
          global.connectionResult[newConnectionIndex].scriptHashes = [
            ...findConnection.scriptHashes,
            scriptHash
          ];
        }
      }
    } else {
      const newConnectionIndex = global.connectionResult.findIndex(
        (connection) => connection.count < 1000
      );
      if (newConnectionIndex >= 0) {
        const newConnection = global.connectionResult[newConnectionIndex];
        connectionString = newConnection.connectionString;
        global.connectionResult[newConnectionIndex].count++;
        global.connectionResult[newConnectionIndex].scriptHashes = [
          ...newConnection.scriptHashes,
          scriptHash
        ];
      } else {
        const alreadyConnections = global.connectionResult.map(
          (connection) => connection.connectionString
        );
        const newConnection = connections.find(
          (connection) => !alreadyConnections.includes(connection)
        );
        if (newConnection) {
          connectionString = newConnection;
          global.connectionResult.push({
            connectionString,
            scriptHashes: [scriptHash],
            count: 1
          });
        }
      }
    }
  }

  return connectionString;
};

export const decodeVOutAsm = (asm: string) => {
  // Split the ASM string into parts
  const parts = asm.split(' ');

  // Check if this is a P2PKH (Pay to Public Key Hash) with EVR asset
  if (parts[0] === 'OP_DUP' && parts[1] === 'OP_HASH160') {
    const pubKeyHash = parts[2];

    // If we have OP_EVR_ASSET, decode the asset data
    // if (parts.includes('OP_EVR_ASSET')) {
    const assetDataHex = parts[parts.length - 1];

    // Parse EVR asset data
    // First 4 bytes (8 chars) are asset type
    const assetType = assetDataHex.substring(0, 8);

    // Next bytes until 0x00 are asset name
    const assetNameHex = assetDataHex.substring(8).split('00')[0];
    const rawAssetName = Buffer.from(assetNameHex, 'hex').toString();
    const assetName = rawAssetName
      .replace(/[\x00-\x1F\x7F-\x9F]/g, '')
      .replace(/^t+/, '')
      .replace(/[^\w\s-]/g, '')
      .trim();

    // Last 8 bytes (16 chars) before the final byte are amount
    const amountHex = assetDataHex.substring(assetDataHex.length - 17, assetDataHex.length - 1);
    const amount = parseInt(amountHex);

    return {
      type: 'P2PKH_EVR',
      address: pubKeyHash, // Note: This is the hash160,
      assetInfo: {
        assetType,
        assetName,
        amount
      }
    };
    // }
  }

  return { type: 'UNKNOWN' };
};
export const getAddressFromScriptSig = (asm: string): string | null => {
  try {
    // Extract public key from scriptSig
    const parts = asm.split(' ');
    const publicKey = parts[parts.length - 1];

    if (publicKey) {
      // Convert public key to address
      return publicKeyToAddress(publicKey);
    }

    return null;
  } catch (error) {
    console.error('Error extracting address from scriptSig:', error);
    return null;
  }
};

const publicKeyToAddress = (publicKeyHex: string): string => {
  // You'll need a library like bitcoinjs-lib for this
  const { address } = bitcoinjs.payments.p2pkh({
    pubkey: Buffer.from(publicKeyHex, 'hex'),
    network: evrmoreNetwork() // or bitcoin.networks.testnet
  });

  return address!;
};

export const createH160Address = (pubkey: string): string => {
  try {
    // Step 1: SHA-256 hash of the public key
    const sha256Hash = crypto.createHash('sha256').update(Buffer.from(pubkey, 'hex')).digest();

    // Step 2: RIPEMD-160 hash of the SHA-256 hash
    const ripemd160Hash = crypto.createHash('ripemd160').update(sha256Hash).digest();

    // Convert to hex string
    return ripemd160Hash.toString('hex');
  } catch (e) {
    console.log('Error:- createH160Address', e);
    throw e;
  }
};

export const fromAddress = ({
  address,
  amount,
  asset,
  memo,
  timestamp
}: {
  address: string;
  amount: number;
  asset?: string | null;
  memo?: string | null;
  timestamp?: number | null;
}) => {
  try {
    const rawAddress = bs58.decode(address);
    const type = rawAddress[0];
    const h160 = rawAddress.slice(1, 0x14 + 1);
    const rawSum = rawAddress.slice(0x14 + 1);

    console.log('PreData', rawAddress, type, h160, asset);

    const raw: number[] = [];
    raw.push(0x76, 0xa9, ...byteDataIterable(opPush(h160.length)), ...h160, 0x88, 0xac);
    // if (type === 60) {
    //   raw.push(0x76, 0xa9, ...byteDataIterable(opPush(h160.length)), ...h160, 0x88, 0xac);
    // } else if (type === 122) {
    // raw.push(0xa9, ...byteDataIterable(opPush(h160.length)), ...h160, 0x87);
    // } else {
    //   throw new Error('Invalid Address (2)');
    // }

    if (asset && asset !== 'EVR') {
      console.log('OPS', bitcoinjs.script.OPS, bitcoinjs.script.OPS['OP_EVR_ASSET'], 0x100);
      raw.push(0x100);
      // const amountBuffer = Buffer.alloc(8);
      // amountBuffer.writeBigUInt64LE(BigInt(amount));
      const amountBuffer = Buffer.alloc(8);
      amountBuffer.writeBigUInt64LE(BigInt(amount));

      console.log('ASSET AND AMOUNT', asset, amount);
      const assetScript: number[] = [
        0x13,
        0x65,
        0x76,
        0x72,
        0x74,
        // 0xac,
        asset.length,
        ...Buffer.from(asset, 'utf8'),
        // 0x00,
        ...Buffer.from(amount.toString(16).padStart(16, '0'), 'hex').reverse(),
        0x75
      ];
      if (memo) {
        assetScript.push(1, ...Buffer.from(memo, 'utf8'));
        if (timestamp) {
          assetScript.push(...new TextEncoder().encode(timestamp.toString()));
        }
      }

      // Push the length of the assetScript to the raw script
      if (assetScript.length <= 0x4b) {
        raw.push(assetScript.length);
      } else if (assetScript.length <= 0xff) {
        raw.push(0x4c, assetScript.length);
      } else if (assetScript.length <= 0xffff) {
        raw.push(0x4d, assetScript.length & 0xff, (assetScript.length >> 8) & 0xff);
      }
      raw.push(...assetScript);
      raw.push(0x75);
      // raw.push(...byteDataIterable(opPush(assetScript.length)), ...assetScript, 0x75);
    }

    return Buffer.from(raw);
  } catch (e: any) {
    console.error(`Error:- Error in fromAddress ${e}`);
  }
};

export const doubleSHA256 = (data: number[]): number[] => {
  const hash1 = createHash('sha256').update(Buffer.from(data)).digest();
  const hash2 = createHash('sha256').update(hash1).digest();
  return Array.from(hash2);
};

// Convert ByteData to iterable array of bytes
export const byteDataIterable = (byteData): number[] => {
  return Array.from(new Uint8Array(byteData));
};

// Function to create an opPush ByteData
export const opPush = (length: number) => {
  if (length < 0) throw new Error(`${length} cannot be an op_push`);
  if (length < 0x4c) {
    return new Uint8Array([length]);
  } else if (length <= 0xff) {
    return new Uint8Array([0x4c, length]);
  } else if (length <= 0xffff) {
    const buffer = new Uint8Array(3);
    buffer[0] = 0x4d;
    buffer.set(new Uint16Array([length]), 1);
    return new Uint8Array(buffer);
  }
  const buffer = new Uint8Array(5);
  buffer[0] = 0x4e;
  buffer.set(new Uint32Array([length]), 1);
  return new Uint8Array(buffer);
};

export const serialize = (inputArray, outputArray): Buffer => {
  try {
    const sVersion = Buffer.alloc(4);
    sVersion.writeUInt32LE(2, 0);
    const sLockTime = Buffer.alloc(4);
    sLockTime.writeUInt32LE(0, 0);
    console.log('Pre Data', sVersion, sLockTime);

    // BIP69 sorting
    inputArray.sort((a, b) => {
      const cmp1 = (b.positioning ?? 0) - (a.positioning ?? 0);
      if (cmp1 !== 0) return cmp1;
      const cmp2 = a.hash.toString('hex').localeCompare(b.hash.toString('hex'));
      if (cmp2 !== 0) return cmp2;
      return b.index - a.index;
    });

    console.log('inputArray sorted');

    outputArray.sort((a, b) => {
      const cmp1 = (b.positioning ?? 0) - (a.positioning ?? 0);
      if (cmp1 !== 0) return cmp1;
      const cmp2 = a.value - b.value;
      if (cmp2 !== 0) return cmp2;
      return a.script.toString('hex').localeCompare(b.script.toString('hex'));
    });
    console.log('outputArray sorted');

    const inputArrayBuffer = inputArray.map((vin) => vinSerialize(vin));
    console.log('inputArrayBuffer', inputArrayBuffer);

    const outputArrayBuffer = outputArray.map((vout) => vOutSerialize(vout));
    console.log('outputArrayBuffer', outputArrayBuffer);

    const serializedData = Buffer.concat([
      sVersion,
      Buffer.from([inputArray.length]),
      ...inputArray.map((vin) => vinSerialize(vin)),
      Buffer.from([outputArray.length]),
      ...outputArray.map((vout) => vOutSerialize(vout)),
      sLockTime
    ]);

    return serializedData;
  } catch (e) {
    console.log('Error:- serialize', e);
    throw new Error(e);
  }
};

const vinSerialize = (vinData): Buffer => {
  const prevTxidBuffer = Buffer.from(vinData.hash);
  const prevIdxBuffer = Buffer.alloc(4);
  prevIdxBuffer.writeUInt32LE(vinData.index, 0);

  const scriptLengthBuffer = Buffer.from([vinData.script.length]);
  const scriptBuffer = Buffer.from(vinData.script);

  const sequenceBuffer = Buffer.alloc(4);
  sequenceBuffer.writeUInt32LE(vinData.sequence, 0);

  return Buffer.concat([
    prevTxidBuffer.reverse(),
    prevIdxBuffer,
    scriptLengthBuffer,
    scriptBuffer,
    sequenceBuffer
  ]);
};

const vOutSerialize = (voutData): Buffer => {
  const satsBuffer = Buffer.alloc(8);
  satsBuffer.writeBigUInt64LE(BigInt(voutData.value), 0); // Write the 64-bit unsigned integer

  const scriptLength = Buffer.alloc(1);
  scriptLength.writeUInt8(voutData.script.length); // Write the length of the script

  return Buffer.concat([satsBuffer, scriptLength, voutData.script]);
};
