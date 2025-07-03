import * as ravencoin from 'ravencoinjs-lib';
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
export const REDIS_CONFIG: RedisClientOptions = {
  url: `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || '6379'}`,
  // If you have password:
  password: process.env.REDIS_PASSWORD
};
export const CHANNELS = {
  ASSET_SERVICE_REGISTRY: 'asset-service-registry',
  getAssetQueryChannel: (serviceId: string) => `asset-query-${serviceId}`,
  getAssetResponseChannel: (serviceId: string) => `asset-response-${serviceId}`
};
export const connections = ['moontree.com:50002'];

export const getPubkey = (xpubkey: string, index?: string) => {
  const network = ravenCoinNetwork(index);
  let pubkey: Buffer;
  if (typeof xpubkey === 'string') {
    if (xpubkey.startsWith('0')) {
      pubkey = Buffer.from(xpubkey, 'hex');
      return {
        pubkey,
        xpubKey: xpubkey
      };
    } else {
      const node = bip32.BIP32Factory(ecc).fromBase58(xpubkey, network);
      if (index) {
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
    throw new Error('Invalid xpubkey type: must be a string');
  }
};

export const ravenCoinNetwork = (index?: string) => {
  let derivationAccountPath = "m/44'/175'/0'";
  if (index) {
    derivationAccountPath += `/${index}`;
  }
  return {
    messagePrefix: '\x16Raven Signed Message:\n',
    bech32: 'rc',
    bip32: {
      public: 0x0488b21e,
      private: 0x0488ade4
    },
    pubKeyHash: 0x3c,
    scriptHash: 0x7a,
    wif: 0x80,
    derivationAccountPath
  };
};

export const getRavenAddress = (pubkey: Buffer, network: any): string => {
  const pubKeyHash = ravencoin.crypto.hash160(pubkey);
  return ravencoin.address.toBase58Check(pubKeyHash, network.pubKeyHash);
};

export const getRavenScriptHash = (pubkey: Buffer): string => {
  const pubKeyHash = ravencoin.crypto.hash160(pubkey);
  const p2pkhScript = Buffer.concat([
    Buffer.from([0x76, 0xa9, 0x14]),
    pubKeyHash,
    Buffer.from([0x88, 0xac])
  ]);
  const scriptHash = crypto.createHash('sha256').update(p2pkhScript).digest();
  scriptHash.reverse();
  return scriptHash.toString('hex');
};

export const getDerivedData = async (xpubkey: string, index?: string) => {
  try {
    const network = ravenCoinNetwork(index);
    const pubkeyData = getPubkey(xpubkey, index);
    const address = getRavenAddress(pubkeyData.pubkey, network);
    const scripthash = getRavenScriptHash(pubkeyData.pubkey);
    return {
      pubkey: pubkeyData,
      address,
      scripthash
    };
  } catch (e) {
    //('Error:- getDerivedData', e);
    throw e;
  }
};
export const getChildFromKeypair = (keyPairArray) => {
  const pubkeyHash = Buffer.from(keyPairArray);

  const { address } = ravencoin.address.toBase58Check(
    pubkeyHash,
    ravencoin.networks.ravencoin.pubKeyHash
  );

  console.log('address', address);

  const p2pkhScript = Buffer.concat([
    Buffer.from([0x76, 0xa9, 0x14]), // OP_DUP OP_HASH160 PUSH20
    pubkeyHash,
    Buffer.from([0x88, 0xac]) // OP_EQUALVERIFY OP_CHECKSIG
  ]);

  // Hash the script with SHA256
  const scriptHash = crypto.createHash('sha256').update(p2pkhScript).digest();

  return {
    address,
    scripthash: scriptHash.toString('hex')
  };
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
    network: ravenCoinNetwork() // or bitcoin.networks.testnet
  });

  return address!;
};
export enum ScriptType {
  P2PK = 'P2PK',
  P2SH = 'P2SH',
  P2PKH = 'P2PKH'
}
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
