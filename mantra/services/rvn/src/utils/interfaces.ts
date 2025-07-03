export interface ISaveBackground {
  walletIds: number[];
  derivedTransaction: ITransaction[];
}

export interface ITransaction {
  unspentDetails: any;
  scriptHash: string;
  derivedId: number;
}
