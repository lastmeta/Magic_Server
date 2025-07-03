import { Wallet } from '../wallet/wallet.entity';

export interface IDerived {
  id?: number;
  walletId: number; // parent wallet id
  pubkey: string;
  address: string;
  scripthash?: string;
  exposure?: number;
  index: number;
  status?: string;
  wallet?: Wallet;
  derivedBalance?: IDerivedBalance[];
}

export interface IDerivedBalance {
  id?: number;
  derivedId: number; // derived id
  asset?: string;
  satsConfirmed: number;
  satsUnconfirmed: number;
  derived?: IDerived;
}

export interface IBlockchainVOut {
  id?: number;
  node?: number;
  value?: number;
  asset?: string | null; // nullable in the class
  tx_hash?: string;
  scriptPubKey_asm?: string;
  scriptPubKey_hex?: string;
  scriptPubKey_reqSigs?: number;
  scriptPubKey_type?: string;
  scriptPubKey_addresses?: string[];
}

export interface IBlockchainUnSpent {
  id?: number;
  status?: string;
  tx_hash?: string;
  tx_pos?: number;
  asset?: string;
  value?: number;
  height?: number;
  walletId?: number;
  derivedId?: number;
}
