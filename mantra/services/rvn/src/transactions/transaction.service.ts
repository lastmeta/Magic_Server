import { Inject, forwardRef, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { BlockchainTransaction } from './transaction.entity';
import { BlockchainUnSpent } from './unspent.entity';
import { BlockchainVOut } from './vout.entity';
import { BlockchainVIn } from './vin.entity';
import { DerivedService } from '../derived/derived.service';
import * as bitcoin from 'bitcoinjs-lib';
import {
  createH160Address,
  decodeVOutAsm,
  getAddressFromScriptSig,
  getChildFromKeypair,
  getInputType,
  getVinLockingScriptType,
  ravenCoinNetwork
} from '../utils/common';
import { ElectrumXService } from '../socket/socket-client.serve';
import { Derived } from '../derived/derived.entity';
// import * as crypto from 'crypto';
import ecc from '@bitcoinerlab/secp256k1';
import { TransactionMetadata } from './transaction_metadata.entity';
import { ISaveBackground } from '../utils/interfaces';
import * as evrmore from 'evrmorejs';
@Injectable()
export class TransactionService {
  constructor(
    @InjectRepository(BlockchainTransaction)
    private transactionRepository: Repository<BlockchainTransaction>,
    @InjectRepository(TransactionMetadata)
    private transactionMetadataRepository: Repository<TransactionMetadata>,
    @InjectRepository(BlockchainUnSpent)
    private unSpentRepository: Repository<BlockchainUnSpent>,
    @InjectRepository(BlockchainVOut)
    private voutRepository: Repository<BlockchainVOut>,
    @InjectRepository(BlockchainVIn)
    private vinRepository: Repository<BlockchainVIn>,
    @Inject(forwardRef(() => DerivedService))
    private derivedService: DerivedService,
    @Inject(forwardRef(() => ElectrumXService)) // Ensure this is correct
    private readonly webSocketClientService: ElectrumXService
  ) {
    bitcoin.initEccLib(ecc);
  }

  async findAll(): Promise<BlockchainTransaction[]> {
    return await this.transactionRepository.find();
  }
  async findAllUnspents({
    walletId,
    derivedId,
    derivedIds
  }: {
    walletId?: number;
    derivedId?: number;
    derivedIds?: number[];
  }): Promise<BlockchainUnSpent[]> {
    const condition: any = {};
    if (walletId) condition.walletId = walletId;
    if (derivedId) condition.derivedId = derivedId;
    if (derivedIds?.length) {
      condition.derivedId = In(derivedIds);
    }
    return await this.unSpentRepository.find({ where: condition });
  }

  async saveUnSpent(unspent: BlockchainUnSpent): Promise<BlockchainUnSpent> {
    if (unspent.id) {
      return await this.unSpentRepository.save(unspent);
    }
    const unspentData = new BlockchainUnSpent();
    unspentData.asset = unspent.asset;
    unspentData.value = unspent.value;
    unspentData.tx_hash = unspent.tx_hash;
    unspentData.tx_pos = unspent.tx_pos;
    unspentData.walletId = unspent.walletId;
    unspentData.derivedId = unspent.derivedId;
    unspentData.height = unspent.height;

    return await this.unSpentRepository.save(unspentData);
  }

  async getUnSpentByTxHash(txHash: string): Promise<BlockchainUnSpent> {
    return await this.unSpentRepository.findOne({ where: { tx_hash: txHash } });
  }

  async getAllVOuts({
    transactionHashes
  }: {
    transactionHashes?: string[];
  }): Promise<BlockchainVOut[]> {
    const condition: any = {};
    if (transactionHashes?.length) {
      condition.tx_hash = In(transactionHashes);
    }

    return this.voutRepository.find({
      where: condition
    });
  }

  async getVOUtDetails(txid: string, vout: number): Promise<BlockchainVOut> {
    return this.voutRepository.findOne({
      where: {
        tx_hash: txid,
        node: vout
      }
    });
  }
  async getAllVIns({
    transactionHashes
  }: {
    transactionHashes?: string[];
  }): Promise<BlockchainVIn[]> {
    const condition: any = {};
    if (transactionHashes?.length) {
      condition.tx_hash = In(transactionHashes);
    }

    return this.vinRepository.find({
      where: condition
    });
  }

  async saveVOut(vout: any): Promise<BlockchainVOut> {
    if (vout.id) {
      return await this.voutRepository.save(vout);
    }
    const voutData = new BlockchainVOut();
    voutData.node = vout.n;
    voutData.value = vout?.scriptPubKey?.asset?.amount ?? vout.valueSat;
    voutData.tx_hash = vout.tx_hash;
    voutData.asset = vout?.scriptPubKey?.asset?.name ?? 'RVN';
    if (vout.scriptPubKey) {
      voutData.scriptPubKey_asm = vout.scriptPubKey.asm;
      voutData.scriptPubKey_hex = vout.scriptPubKey.hex;
      voutData.scriptPubKey_reqSigs = vout.scriptPubKey.reqSigs;
      voutData.scriptPubKey_type = vout.scriptPubKey.type;
      voutData.scriptPubKey_addresses = vout.scriptPubKey.addresses;
    }
    return await this.voutRepository.save(voutData);
  }

  async saveVIn(vin: any): Promise<BlockchainVIn> {
    const vinData = new BlockchainVIn();
    vinData.sequence = vin.sequence;
    vinData.vout = vin.vout;
    vinData.tx_hash = vin.tx_hash;
    vinData.txid = vin.txid;
    if (vin.scriptSig) {
      vinData.scriptSig_hex = vin.scriptSig.hex;
      vinData.scriptSig_asm = vin.scriptSig.asm;
    }
    return await this.vinRepository.save(vinData);
  }

  async saveTx(tx: any): Promise<BlockchainTransaction> {
    try {
      if (tx.id) {
        return await this.transactionRepository.save(tx);
      } else {
        const existTx = await this.transactionRepository.findOne({
          where: {
            hash: tx.hash
          }
        });
        if (existTx) {
          return await this.transactionRepository.save({
            ...tx,
            id: existTx.id
          });
        } else {
          const txData = new BlockchainTransaction();
          txData.hash = tx.hash;
          txData.height = tx.height;
          txData.blockTime = tx.blockTime;
          txData.lockTime = tx.lockTime;
          txData.vsize = tx.vsize;
          txData.fee = tx.fee;

          return await this.transactionRepository.save(txData);
        }
      }
    } catch (e) {
      console.error(`Error:- saveTx: ${e}`);
      throw new Error(e);
    }
  }

  async saveTxMetadata(txMetadatas: any, txId: number): Promise<void> {
    try {
      const metadataEntries = await Promise.all(
        txMetadatas.map((elem) => {
          if (elem.id) {
            return elem;
          } else {
            const metadataObj = new TransactionMetadata();
            metadataObj.txId = txId;
            metadataObj.address = elem.address;
            metadataObj.asset = elem.asset;
            metadataObj.sameWallet = elem.sameWallet;
            metadataObj.tx_hash = elem.tx_hash;
            if (elem.sent) {
              metadataObj.sent = elem.sent;
            }
            if (elem.receive) {
              metadataObj.receive = elem.receive;
            }

            return metadataObj;
          }
        })
      );
      await this.transactionMetadataRepository.save(metadataEntries);
    } catch (e) {
      console.error(`Error:- saveTxMetadata: ${e}`);
      throw new Error(e);
    }
  }

  async getTxMetadata(query) {
    try {
      const condition: any = {};
      if (query.address) {
        condition.address = query.address;
      }
      if (query.asset) {
        condition.asset = query.asset;
      }
      if (query.tx_hash) {
        condition.tx_hash = query.tx_hash;
      }
      if (query.sent) {
        condition.sent = query.sent;
      }
      if (query.receive) {
        condition.receive = query.receive;
      }

      return this.transactionMetadataRepository.findOne({
        where: condition
      });
    } catch (error) {
      console.error(`Error:- getTxMetadata: ${error}`);
      throw new Error(error);
    }
  }

  async getAllUTXOs(derivedIds: number[]) {
    try {
      const utxos = await this.unSpentRepository.find({
        where: { derivedId: In(derivedIds), status: 'unspent' },
        order: { value: 'DESC' }
      });
      if (utxos?.length > 0) {
        const vouts = await Promise.all(
          utxos.map((utxo) =>
            this.voutRepository.findOne({
              where: {
                tx_hash: utxo.tx_hash,
                node: utxo.tx_pos
              }
            })
          )
        );
        console.log('LENGTHs', utxos.length, vouts.length);

        return {
          utxos,
          vouts
        };
      }
      return {};
    } catch (e) {
      console.error(`Error:- getAllUTXOs: ${e}`);
      throw new Error(e);
    }
  }

  async saveUnspentTransaction(unspents: ISaveBackground) {
    try {
      console.log('UNSPENTS', JSON.stringify(unspents, null, 2));
      const allDerivedData = await this.derivedService.getAllDerivedData({
        walletIds: unspents.walletIds
      });
      const addresses = allDerivedData.map((elem) => elem.address);
      if (unspents?.derivedTransaction?.length) {
        for (const unspentTx of unspents.derivedTransaction) {
          const derivedData = allDerivedData.find((elem) => elem.id === unspentTx.derivedId);
          const alreadyExistUTXOs = await this.findAllUnspents({
            derivedId: unspentTx.derivedId
          });

          const transactions: any[] = [];
          const unspentData = unspentTx.unspentDetails as any[];
          const unspentsTransactionHashes: string[] = [
            ...new Set(unspentData.map((item) => item.hash))
          ];
          if (!unspentData.length && alreadyExistUTXOs.length) {
            await Promise.all(
              alreadyExistUTXOs.map((elem) => {
                elem.status = 'consumed';
                return this.saveUnSpent(elem);
              })
            );
          }
          if (unspentData.length) {
            await Promise.all([
              unspentData.map(async (unspent) => {
                const alreadyExistUTXO = alreadyExistUTXOs.find(
                  (elem) =>
                    elem.asset === unspent.asset &&
                    elem.tx_hash === unspent.tx_hash &&
                    elem.tx_pos === unspent.tx_pos
                );
                if (alreadyExistUTXO) {
                  alreadyExistUTXO.value = unspent.value;
                  alreadyExistUTXO.height = unspent.height;
                  await this.saveUnSpent(alreadyExistUTXO);
                } else {
                  const requestData = {
                    ...unspent,
                    status: 'unspent'
                  };
                  if (derivedData) {
                    requestData.derivedId = derivedData.id;
                  }
                  await this.saveUnSpent(requestData);
                }
              }),
              alreadyExistUTXOs.map((item) => {
                if (unspentData.length && item.status === 'unspent') {
                  const isUTXOReceived = unspentData.find(
                    (subItem) =>
                      subItem.asset === item.asset &&
                      subItem.tx_hash === item.tx_hash &&
                      subItem.tx_pos === item.tx_pos
                  );
                  if (!isUTXOReceived) {
                    item.status = 'consumed';
                    return this.saveUnSpent(item);
                  }
                }
              })
            ]);
          }
          console.log('unspentTransactionHashes', unspentsTransactionHashes);

          const vouts = await this.getAllVOuts({
            transactionHashes: unspentsTransactionHashes
          });
          const vins = await this.getAllVIns({
            transactionHashes: unspentsTransactionHashes
          });

          const alreadyFetchedTxs: any = [];
          if (unspentsTransactionHashes.length) {
            for (const transactionHash of unspentsTransactionHashes) {
              const transactionMetadatas = [];
              const transaction: any = unspentTx.unspentDetails.find(
                (item: any) => (item?.hash as string) === transactionHash
              );
              const transactionObj: BlockchainTransaction = {
                hash: transaction.hash,
                height: transaction.height,
                vsize: transaction.vsize,
                blockTime: new Date(transaction.blocktime * 1000),
                lockTime: new Date(transaction.locktime * 1000)
                // fee: 0
              };
              transactions.push(transaction);
              const voutAmouts = {};
              const vinAmounts = {};
              const transactionVouts = transaction?.vout;
              let totalRVNInputAmount = 0;
              let totalRVNOutputAmount = 0;
              if (transactionVouts?.length) {
                for (const vout of transactionVouts) {
                  const voutData = vouts.find(
                    (elem) => elem.tx_hash === transaction.hash && elem.node === vout.n
                  );
                  if (voutData) {
                    voutData.value = vout.valueSat;
                    await this.saveVOut(voutData);
                  } else {
                    const voutDataObj = {
                      ...vout,
                      tx_hash: transaction.hash
                    };
                    const voutResponse = await this.saveVOut(voutDataObj);
                    vouts.push(voutResponse);
                  }
                  const voutAsset = vout?.scriptPubKey?.asset?.name ?? 'RVN';
                  const voutAmount = vout?.scriptPubKey?.asset
                    ? vout?.scriptPubKey?.asset?.amount
                    : vout?.valueSat;
                  if (voutAmouts[voutAsset]) {
                    voutAmouts[voutAsset] += voutAmount;
                  } else {
                    voutAmouts[voutAsset] = voutAmount;
                  }
                  const vOutAddress = vout?.scriptPubKey?.addresses[0];
                  if (voutAsset === 'RVN') {
                    totalRVNOutputAmount += voutAmount;
                  }

                  const vOutTransactionMetadata: TransactionMetadata = {
                    tx_hash: transaction.hash,
                    address: vOutAddress,
                    asset: voutAsset
                    // sent: voutAmount,
                    // txId: transactionDetails.id,
                    // sameWallet: addresses.includes(vOutAddress)
                  };
                  if (addresses?.includes(vOutAddress)) {
                    vOutTransactionMetadata.sameWallet = true;
                    vOutTransactionMetadata.receive = voutAmount;
                  } else {
                    vOutTransactionMetadata.sameWallet = false;
                    vOutTransactionMetadata.sent = voutAmount;
                  }

                  transactionMetadatas.push(vOutTransactionMetadata);
                }
              }
              const transactionVins = transaction?.vin;
              if (transactionVins?.length) {
                for (const vin of transactionVins) {
                  const vinData = vins.find(
                    (elem) => elem.tx_hash === transaction.hash && elem.vout === vin.vout
                  );
                  if (!vinData) {
                    const vinDataObj = {
                      ...vin,
                      tx_hash: transaction.hash
                    };
                    const vinResponse = await this.saveVIn(vinDataObj);
                    vins.push(vinResponse);
                  }

                  const vinAddress = getAddressFromScriptSig(vin.scriptSig.asm);
                  //get previous transaction vout from DB
                  const preTx = await this.getVOUtDetails(vin.txid, vin.vout);
                  let preTxAsset: string;
                  let preTxAssetAmount: number;
                  if (preTx) {
                    //If previous transaction vout exist set asset and amount using it
                    // preTxAsset = preTx.asset;
                    // preTxAssetAmount = preTx.value;

                    //if value is null then decrept the scriptSig to get the asset and amount
                    if (!parseInt(preTx.value.toString())) {
                      if (preTx.asset) {
                        preTxAsset = preTx.asset;
                        preTxAssetAmount = parseInt(preTx.value.toString());
                      } else {
                        const decodedScriptSig = decodeVOutAsm(preTx.scriptPubKey_asm);
                        preTxAsset = decodedScriptSig.assetInfo.assetName;
                        preTxAssetAmount = decodedScriptSig.assetInfo.amount;
                      }
                    } else {
                      preTxAsset = 'RVN';
                      preTxAssetAmount = parseInt(preTx.value.toString());
                    }
                  } else {
                    //get the tx from alreadyFetchedArray
                    let preTxFromElectrum: any = alreadyFetchedTxs.find(
                      (alreadyItem) => alreadyItem.txid === vin.txid
                    );

                    // If not found then get the tx from Electrum server and push it in alreadyFetchedArray
                    if (!preTxFromElectrum) {
                      // preTxFromElectrum = await this.getOnlyTransaction({ tx_hex: vin.txid });
                      preTxFromElectrum = this.webSocketClientService.getTransactionDetails({
                        tx_hex: vin.txid
                      });
                      alreadyFetchedTxs.push(preTxFromElectrum.data);
                    }
                    const preTxOuts = preTxFromElectrum?.vout;
                    if (preTxOuts?.length) {
                      const preTxVOut = preTxOuts.find((oldItem) => oldItem.n === vin.vout);
                      if (preTxVOut) {
                        const outAmount = preTxVOut.valueSat;
                        if (outAmount === 0) {
                          //If assetName and amount found in scriptPubKey then use it
                          if (
                            preTxVOut?.scriptPubKey?.asset?.name &&
                            preTxVOut?.scriptPubKey?.asset?.amount
                          ) {
                            preTxAsset = preTxVOut.scriptPubKey.asset.name;
                            preTxAssetAmount = parseInt(preTxVOut.scriptPubKey.asset.amount);
                          } else {
                            //else decode asm and get the asset and amount
                            const decodedScriptSig = decodeVOutAsm(preTxVOut.scriptPubKey.asm);
                            preTxAsset = decodedScriptSig.assetInfo.assetName;
                            preTxAssetAmount = decodedScriptSig.assetInfo.amount;
                          }
                        } else {
                          preTxAsset = 'RVN';
                          preTxAssetAmount = parseInt(outAmount.toString());
                        }
                      }
                    }
                  }
                  if (vinAmounts[preTxAsset]) {
                    vinAmounts[preTxAsset] += preTxAssetAmount;
                  }
                  {
                    vinAmounts[preTxAsset] = preTxAssetAmount;
                  }

                  if (preTxAsset === 'RVN') {
                    totalRVNInputAmount += preTxAssetAmount;
                  }

                  if (preTxAsset && preTxAssetAmount) {
                    const alreadyExistMetadata = await this.getTxMetadata({
                      address: vinAddress,
                      asset: preTxAsset,
                      tx_hash: transaction.hash
                    });
                    if (!alreadyExistMetadata) {
                      const transactionMetadata: TransactionMetadata = {
                        address: vinAddress,
                        asset: preTxAsset,
                        tx_hash: transaction.hash,
                        // txId: transactionDetails.id,
                        sent: Number(preTxAssetAmount.toString()),
                        sameWallet: addresses?.includes(vinAddress)
                      };

                      transactionMetadatas.push(transactionMetadata);
                    }
                  }
                }
              }

              console.log('total amounts', totalRVNInputAmount, totalRVNOutputAmount);
              const fees = totalRVNInputAmount - totalRVNOutputAmount;
              transactionObj.fee = fees;
              const transactionDetails = await this.saveTx(transactionObj);
              await this.saveTxMetadata(transactionMetadatas, transactionDetails.id);
            }
          }
        }
      }
    } catch (error: any) {
      console.error(`Error:- saveUnspentTransaction: ${error}`);
    }
  }

  async saveUnspentTransactionV2(unspents: ISaveBackground) {
    try {
      const allDerivedData: Derived[] = await this.derivedService.getAllDerivedData({
        walletIds: unspents.walletIds
      });
      const derivedIds = allDerivedData.map((item) => item.id);
      const addresses = allDerivedData.map((elem) => elem.address);

      let alreadyExistUTXOs: BlockchainUnSpent[] = await this.findAllUnspents({
        derivedIds
      });
      alreadyExistUTXOs = alreadyExistUTXOs.filter((item) => item.status === 'unspent');

      const unspentTxHashes = unspents.derivedTransaction.map((item) => item.unspentDetails.hash);

      await Promise.all(
        alreadyExistUTXOs.map((item) => {
          if (!unspentTxHashes.includes(item.tx_hash)) {
            item.status = 'consumed';
            return this.saveUnSpent(item);
          }
        })
      );

      await Promise.all(
        unspents.derivedTransaction.map(async (unspent) => {
          const alreadyExistUTXO = alreadyExistUTXOs.find(
            (elem) =>
              elem.asset === unspent.unspentDetails.asset &&
              elem.tx_hash === unspent.unspentDetails.tx_hash &&
              elem.tx_pos === unspent.unspentDetails.tx_pos
          );
          if (alreadyExistUTXO) {
            alreadyExistUTXO.value = unspent.unspentDetails.value;
            alreadyExistUTXO.height = unspent.unspentDetails.height;
            await this.saveUnSpent(alreadyExistUTXO);
          } else {
            const requestData = {
              ...unspent.unspentDetails,
              status: 'unspent'
            };
            const derivedDataIndex = allDerivedData.findIndex(
              (elem) => elem.id === unspent.derivedId
            );
            if (derivedDataIndex >= 0) {
              requestData.derivedId = unspent.derivedId;
            }
            await this.saveUnSpent(requestData);
          }
        })
      );
      const vouts = await this.getAllVOuts({
        transactionHashes: unspentTxHashes
      });
      const vins = await this.getAllVIns({
        transactionHashes: unspentTxHashes
      });
      const transactions: any[] = [];
      const alreadyFetchedTxs: any = [];

      for (const unspentTx of unspents.derivedTransaction) {
        const transactionMetadatas = [];
        const alreadyExistUTXO = alreadyExistUTXOs.findIndex(
          (item) => item.tx_hash === unspentTx.unspentDetails.hash
        );
        if (alreadyExistUTXO >= 0) {
          continue;
        }
        const transaction = unspentTx.unspentDetails;
        const transactionObj: BlockchainTransaction = {
          hash: transaction.hash,
          height: transaction.height,
          vsize: transaction.vsize,
          blockTime: new Date(transaction.blocktime * 1000),
          lockTime: new Date(transaction.locktime * 1000)
          // fee: 0
        };
        transactions.push(transaction);
        const voutAmouts = {};
        const vinAmounts = {};
        const transactionVouts = transaction?.vout;
        let totalRVNInputAmount = 0;
        let totalRVNOutputAmount = 0;
        if (transactionVouts?.length) {
          for (const vout of transactionVouts) {
            const voutData = vouts.find(
              (elem) => elem.tx_hash === transaction.hash && elem.node === vout.n
            );
            if (voutData) {
              voutData.value = vout.valueSat;
              await this.saveVOut(voutData);
            } else {
              const voutDataObj = {
                ...vout,
                tx_hash: transaction.hash
              };
              const voutResponse = await this.saveVOut(voutDataObj);
              vouts.push(voutResponse);
            }
            const voutAsset = vout?.scriptPubKey?.asset?.name ?? 'RVN';
            const voutAmount = vout?.scriptPubKey?.asset
              ? vout?.scriptPubKey?.asset?.amount
              : vout?.valueSat;
            if (voutAmouts[voutAsset]) {
              voutAmouts[voutAsset] += voutAmount;
            } else {
              voutAmouts[voutAsset] = voutAmount;
            }
            const vOutAddress = vout?.scriptPubKey?.addresses[0];
            if (voutAsset === 'RVN') {
              totalRVNOutputAmount += voutAmount;
            }

            const vOutTransactionMetadata: TransactionMetadata = {
              tx_hash: transaction.hash,
              address: vOutAddress,
              asset: voutAsset
              // sent: voutAmount,
              // txId: transactionDetails.id,
              // sameWallet: addresses.includes(vOutAddress)
            };
            if (addresses?.includes(vOutAddress)) {
              vOutTransactionMetadata.sameWallet = true;
              vOutTransactionMetadata.receive = voutAmount;
            } else {
              vOutTransactionMetadata.sameWallet = false;
              vOutTransactionMetadata.sent = voutAmount;
            }

            transactionMetadatas.push(vOutTransactionMetadata);
          }
        }
        const transactionVins = transaction?.vin;

        if (transactionVins?.length) {
          for (const vin of transactionVins) {
            const vinData = vins.find(
              (elem) => elem.tx_hash === transaction.hash && elem.vout === vin.vout
            );
            if (!vinData) {
              const vinDataObj = {
                ...vin,
                tx_hash: transaction.hash
              };
              const vinResponse = await this.saveVIn(vinDataObj);
              vins.push(vinResponse);
            }

            const vinAddress = getAddressFromScriptSig(vin.scriptSig.asm);
            //get previous transaction vout from DB
            const preTx = await this.getVOUtDetails(vin.txid, vin.vout);
            let preTxAsset: string;
            let preTxAssetAmount: number;
            if (preTx) {
              //If previous transaction vout exist set asset and amount using it
              // preTxAsset = preTx.asset;
              // preTxAssetAmount = preTx.value;

              //if value is null then decrept the scriptSig to get the asset and amount
              if (!parseInt(preTx.value.toString())) {
                if (preTx.asset) {
                  preTxAsset = preTx.asset;
                  preTxAssetAmount = parseInt(preTx.value.toString());
                } else {
                  const decodedScriptSig = decodeVOutAsm(preTx.scriptPubKey_asm);
                  preTxAsset = decodedScriptSig.assetInfo.assetName;
                  preTxAssetAmount = decodedScriptSig.assetInfo.amount;
                }
              } else {
                preTxAsset = 'RVN';
                preTxAssetAmount = parseInt(preTx.value.toString());
              }
            } else {
              //get the tx from alreadyFetchedArray
              let preTxFromElectrum: any = alreadyFetchedTxs.find(
                (alreadyItem) => alreadyItem.txid === vin.txid
              );

              // If not found then get the tx from Electrum server and push it in alreadyFetchedArray
              if (!preTxFromElectrum) {
                preTxFromElectrum = await this.webSocketClientService.getTransactionDetails({
                  tx_hex: vin.txid
                });
                alreadyFetchedTxs.push(preTxFromElectrum.data);
              }
              const preTxOuts = preTxFromElectrum?.vout;
              if (preTxOuts?.length) {
                const preTxVOut = preTxOuts.find((oldItem) => oldItem.n === vin.vout);
                if (preTxVOut) {
                  const outAmount = preTxVOut.valueSat;
                  if (outAmount === 0) {
                    //If assetName and amount found in scriptPubKey then use it
                    if (
                      preTxVOut?.scriptPubKey?.asset?.name &&
                      preTxVOut?.scriptPubKey?.asset?.amount
                    ) {
                      preTxAsset = preTxVOut.scriptPubKey.asset.name;
                      preTxAssetAmount = parseInt(preTxVOut.scriptPubKey.asset.amount);
                    } else {
                      //else decode asm and get the asset and amount
                      const decodedScriptSig = decodeVOutAsm(preTxVOut.scriptPubKey.asm);
                      preTxAsset = decodedScriptSig.assetInfo.assetName;
                      preTxAssetAmount = decodedScriptSig.assetInfo.amount;
                    }
                  } else {
                    preTxAsset = 'RVN';
                    preTxAssetAmount = parseInt(outAmount.toString());
                  }
                }
              }
            }
            if (vinAmounts[preTxAsset]) {
              vinAmounts[preTxAsset] += preTxAssetAmount;
            }
            {
              vinAmounts[preTxAsset] = preTxAssetAmount;
            }

            if (preTxAsset === 'RVN') {
              totalRVNInputAmount += preTxAssetAmount;
            }

            if (preTxAsset && preTxAssetAmount) {
              const alreadyExistMetadata = await this.getTxMetadata({
                address: vinAddress,
                asset: preTxAsset,
                tx_hash: transaction.hash
              });
              if (!alreadyExistMetadata) {
                const transactionMetadata: TransactionMetadata = {
                  address: vinAddress,
                  asset: preTxAsset,
                  tx_hash: transaction.hash,
                  // txId: transactionDetails.id,
                  sent: Number(preTxAssetAmount.toString()),
                  sameWallet: addresses?.includes(vinAddress)
                };

                transactionMetadatas.push(transactionMetadata);
              }
            }
          }
        }

        console.log('total amounts', totalRVNInputAmount, totalRVNOutputAmount);
        const fees = totalRVNInputAmount - totalRVNOutputAmount;
        transactionObj.fee = fees;
        const transactionDetails = await this.saveTx(transactionObj);
        await this.saveTxMetadata(transactionMetadatas, transactionDetails.id);
      }
    } catch (error) {
      console.error(`Error:- saveUnspentTransactionV2: ${error}`);
    }
  }

  private async mapTransactionResponse(
    txElem: BlockchainTransaction,
    symbol?: string,
    addresses?: string[]
  ) {
    try {
      console.log('In Map Transaction Response');
      // console.log()
      let filteredMetadata = txElem.metadata;
      if (addresses?.length) {
        filteredMetadata = filteredMetadata.filter((elem) => addresses.includes(elem.address));
      }
      if (symbol) {
        filteredMetadata = filteredMetadata.filter((elem) => elem.asset === symbol);
      }
      console.log('filtered done');
      const receivedObj = {};
      const sentObj = {};
      let received: number = 0;
      let sent: number = 0;

      filteredMetadata.map((item) => {
        const amountReceive = Number(item?.receive?.toString());
        const amountSent = Number(item?.sent?.toString());
        if (item.receive > 0) {
          received += amountReceive;
        }
        if (item.sent > 0) {
          sent += amountSent;
        }
      });
      console.log('final received and sent', received, sent);

      delete txElem.metadata;
      return {
        ...txElem,
        received: received.toFixed(8),
        sent: sent.toFixed(8)
      };
    } catch (e) {
      //(`Error:- mapTransactionResponse: ${e}`);
      throw new Error(e);
    }
  }

  async getTransactionDetails(txId: number) {
    try {
      const tx = await this.transactionRepository.findOne({
        where: { id: txId },
        relations: {
          metadata: true
        }
      });

      return this.mapTransactionResponse(tx);
    } catch (e) {
      console.error(`Error:- getTransactionDetails: ${e}`);
      throw new Error(e);
    }
  }

  async getTransactionHistories({
    symbol,
    walletIds,
    scripthashes,
    limit = 10,
    offset = 0
  }: {
    symbol: string;
    walletIds?: number[];
    scripthashes?: any[];
    limit?: number;
    offset?: number;
  }) {
    try {
      const derivedChildren = await this.derivedService.getAllDerivedData({ walletIds });

      if (scripthashes?.length) {
        const fetchedScripthash = [];
        await Promise.all(
          scripthashes.map((item) => {
            const fetchedResult = getChildFromKeypair(item);

            if (fetchedResult) {
              fetchedScripthash.push(fetchedResult.scripthash);
            }
          })
        );
        if (fetchedScripthash.length)
          derivedChildren.push(
            ...(await this.derivedService.getAllDerivedData({ scripthashes: fetchedScripthash }))
          );
      }
      const addresses = derivedChildren.map((elem) => elem.address);
      // const transactions = await this.transactionRepository.find({
      //   relations: {
      //     metadata: true
      //   }
      // });

      const query = this.transactionRepository
        .createQueryBuilder('transaction')
        .leftJoinAndSelect('transaction.metadata', 'metadata');

      // Add address filter if addresses array is provided
      if (addresses?.length) {
        // Use EXISTS to filter transactions that have metadata with matching addresses
        query.andWhere((qb) => {
          const subQuery = qb
            .subQuery()
            .select('1')
            .from(TransactionMetadata, 'meta')
            .where('meta.txId = transaction.id')
            .andWhere('meta.address IN (:...addresses)', { addresses });
          return 'EXISTS ' + subQuery.getQuery();
        });
        query.setParameter('addresses', addresses);
      }
      if (symbol) {
        // Use EXISTS to filter transactions that have metadata with matching addresses
        query.andWhere((qb) => {
          const subQuery = qb
            .subQuery()
            .select('1')
            .from(TransactionMetadata, 'meta')
            .where('meta.txId = transaction.id')
            .andWhere('meta.asset=:symbol', { symbol });
          return 'EXISTS ' + subQuery.getQuery();
        });
        query.setParameter('symbol', symbol);
      }
      const total = await query.getCount();

      // Add sorting by blockTime
      query.orderBy('transaction.blockTime', 'DESC');

      // Add pagination
      query.skip(offset).take(limit);

      // Execute the query
      const transactions = await query.getMany();

      console.log('ADDRESSES', addresses);

      let groupedTransaction = [];
      if (transactions.length) {
        groupedTransaction = await Promise.all(
          transactions.map((elem) => this.mapTransactionResponse(elem, symbol, addresses))
        );
      }

      return { total, data: groupedTransaction };
    } catch (error) {
      console.error(`Error:- getTransactionHistories: ${error}`);
      throw new Error(error);
    }
  }

  async broadcastTransaction(rawTx: string) {
    return await this.webSocketClientService.broadcastTransaction(rawTx);
  }

  async createTransaction({
    // xpubkeys,
    walletData,
    scripthashes,
    eachOutputAddress,
    eachOutputAsset,
    eachOutputAmount,
    eachOutputAssetMemo,
    eachOutputAssetMemoTimestamp,
    changeSource,
    feeRateKb
  }: {
    // xpubkeys: string[];
    walletData: any[];
    scripthashes: string[];
    eachOutputAddress: string[];
    eachOutputAsset: string[];
    eachOutputAmount: number[];
    eachOutputAssetMemo: string[];
    eachOutputAssetMemoTimestamp: number[];
    changeSource: string;
    feeRateKb: string;
  }) {
    try {
      // Comprise the output
      const comprisedOutputs = eachOutputAddress.map((address, i) => ({
        address,
        asset: eachOutputAsset[i],
        amount: eachOutputAmount[i] * 100000000,
        memo: eachOutputAssetMemo[i],
        timestamp: eachOutputAssetMemoTimestamp[i],
        isChange: false
      }));

      const outputDerivedData = await this.derivedService.getAllDerivedData({
        keys: [...eachOutputAddress, changeSource]
      });
      const derivedChildren = await this.derivedService.getAllDerivedData({
        walletIds: walletData.map((item) => item.id)
      });
      //get derived data from scripthashes
      const fetchedScripthash = [];
      if (scripthashes?.length) {
        await Promise.all(
          scripthashes.map((item) => {
            const fetchedResult = getChildFromKeypair(item);

            if (fetchedResult) {
              fetchedScripthash.push(fetchedResult.scripthash);
            }
          })
        );
        if (fetchedScripthash.length)
          derivedChildren.push(
            ...(await this.derivedService.getAllDerivedData({ scripthashes: fetchedScripthash }))
          );
      }

      const inputAssetAmounts: { [key: string]: number } = {};
      // comprise children derived data
      const comprisedChildren = [];
      for (const child of derivedChildren) {
        if (child?.derivedBalance.length) {
          const childAssetAmounts: { [key: string]: number } = {};
          child.derivedBalance.forEach((elem) => {
            childAssetAmounts[elem.asset] = parseInt(
              (
                (childAssetAmounts[elem.asset] || 0) + parseInt(elem.satsConfirmed.toString())
              ).toString()
            );
            inputAssetAmounts[elem.asset] = parseInt(
              (
                (inputAssetAmounts[elem.asset] || 0) + parseInt(elem.satsConfirmed.toString())
              ).toString()
            );
          });
          const walletItem = walletData.find((item) => item.id === child.walletId);
          const compriseObj = {
            derivedId: child.id,
            pubkey: child.pubkey,
            address: child.address,
            scripthash: child.scripthash,
            index: child.index,
            assets: child.derivedBalance.map((elem) => elem.asset),
            balance: childAssetAmounts,
            walletPubKey: walletItem?.publicKey
          };
          comprisedChildren.push(compriseObj);
        }
      }

      //pre-data
      const derivedIds = comprisedChildren.map((child) => child.derivedId);
      const derivedScriptHashes = comprisedChildren.map((child) => child.scripthash);

      //output amount each asset vise
      const outputAssetAmounts: { [key: string]: number } = {};
      comprisedOutputs.forEach((output) => {
        outputAssetAmounts[output.asset] = (outputAssetAmounts[output.asset] || 0) + output.amount;
      });
      //('AssetAmount', inputAssetAmounts, outputAssetAmounts);

      //validate available balance for each output asset
      let errorMessage = '';
      for (const [asset, value] of Object.entries(outputAssetAmounts)) {
        const inputAmount = inputAssetAmounts[asset] || 0;
        if (inputAmount < value) {
          errorMessage += `Insufficient ${asset} balance to create transaction`;
        }
      }
      // if (errorMessage) {
      //   throw new Error(errorMessage);
      // }

      //1. get all utxos
      let utxos = await this.unSpentRepository.find({
        where: { derivedId: In(derivedIds), status: 'unspent' },
        order: { value: 'DESC' }
      });

      if (!utxos.length) {
        await Promise.all([
          fetchedScripthash.map((item) =>
            this.webSocketClientService.getTransaction({ scripthash: item.scripthash })
          ),
          derivedScriptHashes.map((scripthash) =>
            this.webSocketClientService.getTransaction({ scripthash })
          )
        ]);
        const allUtxos = await this.unSpentRepository.find({
          where: { derivedId: In(derivedChildren.map((elem) => elem.id)), status: 'unspent' },
          order: { value: 'DESC' }
        });

        if (!allUtxos.length) {
          throw new Error('No UTXOs found');
        }
        utxos = allUtxos;
      }
      // bitcoin.address.toOutputScript('',evrmore.network)

      // Fetch corresponding vouts for the UTXOs
      const vouts = await Promise.all(
        utxos.map((utxo) =>
          this.voutRepository.findOne({
            where: {
              tx_hash: utxo.tx_hash,
              node: utxo.tx_pos
            }
          })
        )
      );
      const utxoAssetAmounts: { [key: string]: number } = {};
      utxos.forEach((utxo) => {
        const assetName = utxo.asset || 'RVN';
        utxoAssetAmounts[assetName] = parseInt(
          ((utxoAssetAmounts[assetName] || 0) + utxo.value).toString()
        );
      });

      console.log('utxoAssetAmounts', utxoAssetAmounts);
      //validate utxo balance for each output asset
      let utxoErrorMessage;
      for (const [asset, value] of Object.entries(outputAssetAmounts)) {
        const inputAmount = utxoAssetAmounts[asset] || 0;
        if (inputAmount < value) {
          utxoErrorMessage += `Insufficient ${asset} balance to create transaction`;
        }
      }
      if (!eachOutputAsset.includes('RVN') && !utxoAssetAmounts['RVN']) {
        utxoErrorMessage = `Insufficient RVN balance to create transaction`;
      }
      if (utxoErrorMessage) {
        throw new Error(utxoErrorMessage);
      }
      return await this.generateTransaction({
        comprisedOutputs,
        comprisedChildren,
        utxos,
        estimationFees: 0,
        changeSource,
        eachOutputAsset,
        vouts,
        outputDerivedData,
        feeRateKb
      });
    } catch (e: any) {
      //(`Error:- create new transaction:- ${e}`);
      throw new Error(e);
    }
  }
  async generateTransaction({
    comprisedOutputs,
    comprisedChildren,
    utxos,
    estimationFees,
    changeSource,
    eachOutputAsset,
    vouts,
    outputDerivedData,
    feeRateKb
  }) {
    try {
      const inputArray = [];
      const inputUTXOs = [];
      const outputArray = [];
      const changeSourceData: Derived = outputDerivedData.find(
        (outputElem) => outputElem.address === changeSource
      );
      const txIds: string[] = Array.from(new Set(utxos.map((utxo) => utxo.tx_hash)));
      //Suggestion: This can be fetched from the DB after storing it at time of saving trasactiondetails
      const txHexs = await Promise.all(
        txIds.map(async (txId) => {
          const transactionDetails: any = await this.webSocketClientService.getTransactionDetails({
            tx_hex: txId
          });
          return transactionDetails;
        })
      );

      for (const outputElem of comprisedOutputs) {
        let filterUTXOs = utxos.filter((utxo) => (utxo.asset || 'RVN') === outputElem.asset);
        if (!filterUTXOs.length) {
          const filteredDerived = comprisedChildren.filter((child) =>
            child.assets.includes(outputElem.asset)
          );
          const filteredDerivedIds = filteredDerived.map((elem) => elem.derivedId);
          filterUTXOs = utxos.filter((utxo) => filteredDerivedIds.includes(utxo.derivedId));
        }
        let spentAmount = 0;
        const moreValueUTXOs = filterUTXOs
          .filter((elem) => elem.value >= outputElem.amount)
          .sort((a, b) => a.value - b.value);
        console.log('morevalue', moreValueUTXOs);
        const lessValueUTXOs = filterUTXOs
          .filter((elem) => elem.value < outputElem.amount)
          .sort((a, b) => b.value - a.value);
        console.log('lessvalue', lessValueUTXOs);
        if (moreValueUTXOs.length) {
          for (const utxo of moreValueUTXOs) {
            if (spentAmount > outputElem.amount + estimationFees) {
              console.log('Needed Amount matched');
              break;
            }
            const isAlreadyAdded = inputArray.findIndex((item) => item.txid === utxo.tx_hash);
            if (isAlreadyAdded >= 0) {
              console.log('UTXO Already Added');
              continue;
            }
            const voutObject = vouts.find(
              (vout) => vout?.tx_hash === utxo?.tx_hash && vout?.node === utxo?.tx_pos
            );
            console.log('vout', voutObject);
            if (!voutObject) {
              throw new Error('Vout not found for UTXO');
            }
            const transactionDetails = txHexs.find((item) => item.txid === utxo.tx_hash);

            const newInputObj = {
              txid: utxo.tx_hash,
              vout: utxo.tx_pos,
              asset: utxo.asset || 'RVN',
              value: utxo.value,
              nonWitnessUtxo: Buffer.from(transactionDetails?.hex, 'hex')
            };

            inputArray.push(newInputObj);
            spentAmount += utxo.value;
            const utxoDerivationData = comprisedChildren.find(
              (item) => item.derivedId === utxo.derivedId
            );
            inputUTXOs.push({
              id: utxoDerivationData?.derivedId,
              walletPubKey: utxoDerivationData?.walletPubKey,
              index: utxoDerivationData?.index,
              amount: utxo.value,
              asset: utxo.asset,
              inputType: getInputType(Buffer.from(voutObject.scriptPubKey_hex, 'hex')),
              scriptPubKey_hex: voutObject.scriptPubKey_hex,
              tx_hash: utxo.tx_hash,
              pos: utxo.tx_pos
            });
            console.log('Must Condition In More', spentAmount, outputElem.amount + estimationFees);
          }
        }
        if (
          (!moreValueUTXOs.length ||
            outputElem.amount + estimationFees > spentAmount ||
            !spentAmount) &&
          lessValueUTXOs.length
        ) {
          for (const utxo of lessValueUTXOs) {
            if (spentAmount > outputElem.amount + estimationFees) {
              console.log('Needed Amount received in Less');
              break;
            }

            const isAlreadyAdded = inputArray.findIndex((item) => item.txid === utxo.tx_hash);
            if (isAlreadyAdded >= 0) {
              console.log('UTXO Already Added');
              continue;
            }
            const voutObject = vouts.find(
              (vout) => vout?.tx_hash === utxo?.tx_hash && vout?.node === utxo?.tx_pos
            );
            if (!voutObject) {
              throw new Error('Vout not found for UTXO');
            }
            const transactionDetails = txHexs.find((item) => item.txid === utxo.tx_hash);

            const newInputObj = {
              txid: utxo.tx_hash,
              vout: utxo.tx_pos,
              asset: utxo.asset || 'RVN',
              value: utxo.value,
              nonWitnessUtxo: Buffer.from(transactionDetails.hex, 'hex')
            };

            inputArray.push(newInputObj);
            spentAmount += utxo.value;
            const utxoDerivationData = comprisedChildren.find(
              (item) => item.derivedId === utxo.derivedId
            );
            inputUTXOs.push({
              id: utxoDerivationData?.derivedId,
              walletPubKey: utxoDerivationData?.walletPubKey,
              index: utxoDerivationData?.index,
              amount: utxo.value,
              asset: utxo.asset,
              inputType: getInputType(Buffer.from(voutObject.scriptPubKey_hex, 'hex')),
              scriptPubKey_hex: voutObject.scriptPubKey_hex,
              tx_hash: utxo.tx_hash,
              pos: utxo.tx_pos
            });

            console.log('Must Condition', spentAmount, outputElem.amount + estimationFees);
          }
        }

        const newOutputObj = {
          address: outputElem.address,
          asset: outputElem.asset,
          amount: outputElem.amount
        };
        outputArray.push(newOutputObj);
        console.log('SPENT', spentAmount, outputElem.amount, estimationFees);

        const changeOutputAmount =
          spentAmount -
          outputElem.amount -
          (outputElem.asset === 'RVN' || !outputElem.asset ? estimationFees : 0);
        console.log('ChangeOutPUTAMOUNT :::::: ', changeOutputAmount);
        if (changeOutputAmount > 0) {
          const newChanheOutputObj = {
            address: changeSource,
            amount: changeOutputAmount,
            asset: outputElem.asset
          };
          outputArray.push(newChanheOutputObj);
        }

        console.log('spentAmount', spentAmount);
      }
      const feeRate = feeRateKb;
      if (!eachOutputAsset.includes('RVN')) {
        const EVRUTXOs = utxos
          .filter((utxo) => utxo.asset === 'RVN' || !utxo.asset)
          .sort((a, b) => b.value - a.value);
        let spentFeesAmount = 0;
        if (EVRUTXOs.length) {
          for (const utxo of EVRUTXOs) {
            if (spentFeesAmount > estimationFees) break;

            const isAlreadyAdded = inputArray.findIndex((item) => item.txid === utxo.tx_hash);
            if (isAlreadyAdded >= 0) {
              console.log('UTXO Already Added');
              continue;
            }
            const voutObject = vouts.find(
              (vout) => vout?.tx_hash === utxo?.tx_hash && vout?.node === utxo?.tx_pos
            );
            if (!voutObject) {
              throw new Error('Vout not found for UTXO');
            }
            const transactionDetails = txHexs.find((item) => item.txid === utxo.tx_hash);

            const newInputObj = {
              txid: utxo.tx_hash,
              vout: utxo.tx_pos,
              asset: utxo.asset || 'RVN',
              value: utxo.value,
              nonWitnessUtxo: Buffer.from(transactionDetails.hex, 'hex')
            };

            inputArray.push(newInputObj);
            spentFeesAmount += utxo.value;
            const utxoDerivationData = comprisedChildren.find(
              (item) => item.derivedId === utxo.derivedId
            );
            inputUTXOs.push({
              id: utxoDerivationData?.derivedId,
              walletPubKey: utxoDerivationData?.walletPubKey,
              index: utxoDerivationData?.index,
              amount: utxo.value,
              asset: utxo.asset,
              inputType: getInputType(Buffer.from(voutObject.scriptPubKey_hex, 'hex')),
              scriptPubKey_hex: voutObject.scriptPubKey_hex,
              tx_hash: utxo.tx_hash,
              pos: utxo.tx_pos
            });
          }
        }

        const changeOutputAmount = spentFeesAmount - estimationFees;
        const newChanheOutputObj = {
          address: changeSource,
          amount: changeOutputAmount,
          asset: 'RVN'
        };
        outputArray.push(newChanheOutputObj);
      }

      console.log('PRE DATA', inputArray, outputArray);

      const estimatedTxSize =
        inputArray.length * 180 +
        (outputArray.length + eachOutputAsset.includes('RVN')
          ? eachOutputAsset.length
          : eachOutputAsset.length + 1) *
          34 +
        10;
      const txSizeInKB = Math.ceil(estimatedTxSize / 1024);
      console.log('txSizeInKB', txSizeInKB);
      const calculatedTransactionFees = txSizeInKB * Math.ceil(feeRate / 1024) * 2;
      const calculatedTransactionFees2 = estimatedTxSize * feeRate;
      let usedAmount = 0;
      inputArray.map((item) => (usedAmount += item.value));
      console.log(
        'fees',
        calculatedTransactionFees,
        calculatedTransactionFees2,
        estimationFees,
        usedAmount,
        Math.ceil(feeRate / 1024)
      );

      if (estimationFees !== calculatedTransactionFees) {
        return this.generateTransaction({
          comprisedOutputs,
          comprisedChildren,
          utxos,
          estimationFees: calculatedTransactionFees,
          changeSource,
          eachOutputAsset,
          vouts,
          outputDerivedData,
          feeRateKb
        });
      } else {

        const newTransaction = await this.generatePsbtTransaction(inputArray, outputArray);
        const psbt = await bitcoin.Psbt.fromHex(newTransaction, {
          network: ravenCoinNetwork()
        });
        const unsignedTx = psbt.data.globalMap.unsignedTx;
        return {
          // txHex: transactinoTypeTrans.toHex(),
          rawHex: newTransaction,
          txHex: unsignedTx.toBuffer().toString('hex'),
          targetFee: calculatedTransactionFees,
          transactionFees: calculatedTransactionFees,
          vinInfo: inputUTXOs.map((elem) => `${elem.walletPubKey}:${elem.index}`),
          vinAmounts: inputUTXOs.map((elem) => elem.amount),
          vinAssets: inputUTXOs.map((elem) => elem.asset),
          vinLockingScriptType: inputUTXOs.map((elem) => getVinLockingScriptType(elem.inputType)),
          vinScriptOverride: inputUTXOs.map((item) => item.scriptPubKey_hex),
          changeSource: inputUTXOs.map(() => createH160Address(changeSourceData?.pubkey)),
          vinPrivateKeySource: inputUTXOs.map((item) => `${item.tx_hash}:${item.pos}`)
        };
      }
    } catch (e) {
      console.log('Error', e);
      //('Error', e);
      throw new Error(e);
    }
  }

  async generatePsbtTransaction(inputArray: any[], outputArray: any[]) {
    const psbt = new bitcoin.Psbt({ network: ravenCoinNetwork() });

    psbt.version = 1;
    psbt.locktime = 0;

    inputArray.forEach((element) => {
      psbt.addInput({
        hash: element.txid,
        index: element.vout,
        nonWitnessUtxo: element.nonWitnessUtxo
      });
    });

    outputArray.forEach((element) => {
      console.log(element);
      psbt.addOutput({
        address: element.address,
        value: element.asset === 'RVN' ? element.amount : 0

        // asset: element.asset === 'RVN' ? undefined : { name: element.asset, amount: element.amount }
      });
    });

    return psbt.toHex();
  }
}
