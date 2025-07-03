import { forwardRef, Inject, Injectable } from '@nestjs/common';
import {
  connections,
  decodeVOutAsm,
  getAddressFromScriptSig,
  getDerivedData,
  getElectrumConnectionString
} from '../utils/common';
import { ElectrumClient } from '@gemlinkofficial/electrum-client-ts';
import { Derived } from '../derived/derived.entity';
import { DerivedService } from '../derived/derived.service';
import { TransactionService } from '../transactions/transaction.service';
import { BlockchainUnSpent } from '../transactions/unspent.entity';
import { BlockchainTransaction } from 'src/transactions/transaction.entity';
import { TransactionMetadata } from 'src/transactions/transaction_metadata.entity';
import { AssetService } from './pubsub.service';
import * as typeorm from 'typeorm';

@Injectable()
export class ElectrumXService {
  constructor(
    @Inject(forwardRef(() => DerivedService))
    private readonly derivedService: DerivedService,
    @Inject(forwardRef(() => TransactionService))
    private readonly transactionService: TransactionService,
    private pubsubService: AssetService
  ) {}
  private electrumClient: ElectrumClient;
  private subscribedScriptHashes: Set<string> = new Set();

  async unSubscribe(scriptHashes: string[]) {
    await Promise.all(
      scriptHashes.map(async (scriptHash) => {
        this.subscribedScriptHashes.delete(scriptHash);
        const findConnection = global.connectionResult.findIndex((connection) =>
          connection.scriptHashes.includes(scriptHash)
        );
        if (findConnection !== -1) {
          const connectionData =
            global.connectionResult[findConnection].connectionString.split(':');
          await this.elecrumClientConnect(connectionData[0], connectionData[1]);

          this.electrumClient.blockchain_scripthash_unsubscribe(scriptHash);

          global.connectionResult[findConnection].scriptHashes = global.connectionResult[
            findConnection
          ].scriptHashes.filter((elem) => elem !== scriptHash);
          global.connectionResult[findConnection].count--;
        }
      })
    );
  }

  async elecrumClientConnect(host: string, port: string) {
    if (!this.electrumClient || this.electrumClient.status === 0) {
      try {
        console.log(`Attempting connection to ${host}:${port}`);
        this.electrumClient = new ElectrumClient(host, port, 'ssl');
        await this.electrumClient.connect('Satori Neuron', '1.10');
        console.log(`Connected to ${host}:${port}`);
        const headers: any = await this.electrumClient.blockchain_headers_subscribe();
        console.log('Headers:', headers);
        this.electrumClient.subscribe.on(
          'blockchain.scripthash.subscribe',
          (scripthash, status) => {
            this.handleSubscribeMessage(scripthash, status);
          }
        );
      } catch (error) {
        console.error(`Connection to ${host}:${port} failed:`, error);
        this.electrumClient = null;
        throw error; // Let caller handle retry
      }
    }
    return true;
  }
  async defaultConnect() {
    const connectionConfig = connections[0].split(':');
    const host = connectionConfig[0];
    const port = connectionConfig[1];
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      try {
        await this.elecrumClientConnect(host, port);
        console.log('Default connection established');
        return;
      } catch (error) {
        attempts++;
        console.error(`Attempt ${attempts}/${maxAttempts} failed:`, error);
        if (attempts === maxAttempts) {
          throw new Error(`Failed to connect to ${host}:${port} after ${maxAttempts} attempts`);
        }
        await new Promise((resolve) => setTimeout(resolve, 2000)); // 2s delay
      }
    }
  }

  async derivedData(xpubkey: string) {
    try {
      const { address, scripthash } = await getDerivedData(xpubkey);

      // if (!this.electrumClient) {
      //   await this.defaultConnect()
      // }
      // const balance = await this.electrumClient.blockchain_scripthash_getBalance(scripthash);
      // console.log('balance', balance);
      const walletData: any = {
        publicKey: xpubkey,
        address,
        scriptHash: scripthash
        // balance
      };
      // const newWalletData = await this.walletService.addWalletData(walletData);
      // if (newWalletData?.id) {
      //   walletData.id = newWalletData.id;
      // }
      return walletData;
    } catch (e) {
      console.log('e in ms', e);
      throw e;
    }
  }

  async derivations(walletData: any, lastIndexWithBalance: number = 0) {
    try {
      const xpubkey = walletData.publicKey;
      const derivationsPerExposure = 20;
      if (!this.electrumClient) {
        await this.defaultConnect();
      }
      // Process all derivations in parallel batches
      const derivedAddresses = await Promise.all(
        Array.from({ length: derivationsPerExposure }, async (_, i) => {
          const childData = await getDerivedData(xpubkey, (i + lastIndexWithBalance).toString());

          return {
            walletId: walletData.id,
            address: childData.address,
            scripthash: childData.scripthash,
            pubkey: childData.pubkey.xpubKey,
            index: i + lastIndexWithBalance
          };
        })
      );
      let newLastIndexWithBalance = 0;
      await Promise.all(
        derivedAddresses.map(async (derivedElement) => {
          let derivedData = await this.derivedService.getDerivedData({
            key: derivedElement.pubkey
          });
          if (!derivedData) {
            console.log('new child to be add', derivedElement.index);
            derivedData = await this.derivedService.addDerivedData(derivedElement);
          }
          const balance = await this.getOnlyBalance({ scripthash: derivedElement.scripthash });
          const isBalanceChanged = Object.keys(balance).length > 0;
          if (derivedElement.index > newLastIndexWithBalance && isBalanceChanged) {
            newLastIndexWithBalance = derivedElement.index;
          }
          // console.log('balance', balance);
          await this.derivedService.saveDerivedBalance(
            balance,
            derivedElement.scripthash,
            derivedData.id
          );
        })
      );
      let returnValue = derivedAddresses;
      console.log('newLastIndexWithBalance', newLastIndexWithBalance, lastIndexWithBalance);
      if (newLastIndexWithBalance > 0 && newLastIndexWithBalance !== lastIndexWithBalance) {
        returnValue = returnValue.concat(
          await this.derivations(walletData, newLastIndexWithBalance + 1)
        );
      }
      // const scripthashes = derivedAddresses.map((derived) => derived.scripthash);
      // this.subscribeToScripthash(scripthashes);
      // console.log('subscribed', subscribed);
      return returnValue;
    } catch (e) {
      console.log('Error deriving addresses:', e);
      throw e;
    }
  }

  async getBalance({ scripthash }: { scripthash?: string }) {
    try {
      let publicScriptHash: string;

      if (scripthash) {
        const derivedData = await this.derivedService.getDerivedData({ key: scripthash });
        if (!derivedData) {
          console.log('Derived data not found for the given scripthash');
          return {};
        } else {
          publicScriptHash = derivedData.scripthash;
        }
      }

      return this.getOnlyBalance({ scripthash: publicScriptHash });
    } catch (e) {
      console.log('Error:- getTransaction :', e);
      throw e;
    }
  }

  async getOnlyBalance({ scripthash }: { scripthash: string }) {
    if (!this.electrumClient) {
      await this.defaultConnect();
    }
    // const balance = await this.electrumClient.blockchain_scripthash_getBalance(publicScriptHash);
    // console.log('balance', balance);
    const allBalance = await this.electrumClient.request('blockchain.scripthash.get_balance', {
      scripthash: scripthash,
      asset: true
    });
    return allBalance;
  }

  async getOnlyUnspent(scriptHash: string) {
    if (!this.electrumClient) {
      await this.defaultConnect();
    }
    const unspent = await this.electrumClient.request('blockchain.scripthash.listunspent', {
      scripthash: scriptHash,
      asset: true
    });
    const transactions = [];
    if ((unspent as any[])?.length) {
      const unspentData = unspent as any[];
      unspentData.forEach(async (unspentData) => {
        const transaction = await this.electrumClient.blockchain_transaction_get(
          unspentData.tx_hash,
          true
        );
        transactions.push(transaction);
      });
    }
    const balance = await this.electrumClient.request('blockchain.scripthash.get_balance', {
      scripthash: scriptHash,
      asset: true
    });
    return {
      unspent,
      transactions,
      balance
    };
  }

  async getTransaction({ scripthash, addresses }: { scripthash?: string; addresses?: string[] }) {
    if (!this.electrumClient) {
      await this.defaultConnect();
    }
    let publicScriptHash: string;
    // let walletData;
    let derivedData: Derived;
    let alreadyExistUTXOs: BlockchainUnSpent[];
    if (scripthash) {
      derivedData = await this.derivedService.getDerivedData({ key: scripthash });
      if (!derivedData) {
        throw new Error('Derived data not found for the given scripthash');
      } else {
        publicScriptHash = derivedData.scripthash;
        alreadyExistUTXOs = await this.transactionService.findAllUnspents({
          derivedId: derivedData.id
        });
      }
    }

    // const unspents = await this.electrumClient.blockchain_scripthash_getHistory(publicScriptHash);
    // console.log('history', history);
    const unspents = await this.electrumClient.request('blockchain.scripthash.listunspent', {
      scripthash: publicScriptHash,
      asset: true
    });
    // console.log('unspent', unspents);
    // const transaction = await this.electrumClient.blockchain_transaction_get(
    //   history[0].tx_hash,
    //   true
    // );
    // console.log('transaction', transaction);
    const transactions: any[] = [];
    const unspentData = unspents as any[];
    const unspentsTransactionHashes: string[] = [
      ...new Set(unspentData.map((item) => item.tx_hash))
    ];
    if (!unspentData.length && alreadyExistUTXOs.length) {
      await Promise.all(
        alreadyExistUTXOs.map((elem) => {
          elem.status = 'consumed';
          return this.transactionService.saveUnSpent(elem);
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
            await this.transactionService.saveUnSpent(alreadyExistUTXO);
          } else {
            const requestData = {
              ...unspent,
              status: 'unspent'
            };
            if (derivedData) {
              requestData.derivedId = derivedData.id;
            }
            await this.transactionService.saveUnSpent(requestData);
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
              return this.transactionService.saveUnSpent(item);
            }
          }
        })
      ]);
    }
    console.log('unspentTransactionHashes', unspentsTransactionHashes);

    const vouts = await this.transactionService.getAllVOuts({
      transactionHashes: unspentsTransactionHashes
    });
    const vins = await this.transactionService.getAllVIns({
      transactionHashes: unspentsTransactionHashes
    });

    const alreadyFetchedTxs: any = [];
    if (unspentsTransactionHashes.length) {
      for (const transactionHash of unspentsTransactionHashes) {
        const transactionMetadatas = [];
        const transaction: any = await this.getTransactionDetails({ tx_hex: transactionHash });
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
        let totalEVRInputAmount = 0;
        let totalEVROutputAmount = 0;
        if (transactionVouts?.length) {
          for (const vout of transactionVouts) {
            const voutData = vouts.find(
              (elem) => elem.tx_hash === transaction.hash && elem.node === vout.n
            );
            if (voutData) {
              voutData.value = vout?.scriptPubKey?.asset?.amount ?? vout.valueSat;
              await this.transactionService.saveVOut(voutData);
            } else {
              const voutDataObj = {
                ...vout,
                tx_hash: transaction.hash
              };
              const voutResponse = await this.transactionService.saveVOut(voutDataObj);
              vouts.push(voutResponse);
            }
            const voutAsset = vout?.scriptPubKey?.asset?.name ?? 'EVR';
            const voutAmount = vout?.scriptPubKey?.asset
              ? vout?.scriptPubKey?.asset?.amount
              : vout?.valueSat;
            if (voutAmouts[voutAsset]) {
              voutAmouts[voutAsset] += voutAmount;
            } else {
              voutAmouts[voutAsset] = voutAmount;
            }
            const vOutAddress = vout?.scriptPubKey?.addresses[0];
            if (voutAsset === 'EVR') {
              totalEVROutputAmount += voutAmount;
            }

            const alreadyExistMetadata = await this.transactionService.getTxMetadata({
              address: vOutAddress,
              asset: voutAsset,
              tx_hash: transaction.hash,
              receive: typeorm.Not(typeorm.IsNull())
            });
            if (!alreadyExistMetadata) {
              const vOutTransactionMetadata: TransactionMetadata = {
                tx_hash: transaction.hash,
                address: vOutAddress,
                asset: voutAsset,
                receive: voutAmount
                // sent: voutAmount,
                // txId: transactionDetails.id,
                // sameWallet: addresses.includes(vOutAddress)
              };

              transactionMetadatas.push(vOutTransactionMetadata);
            }
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
              const vinResponse = await this.transactionService.saveVIn(vinDataObj);
              vins.push(vinResponse);
            }

            const vinAddress = getAddressFromScriptSig(vin.scriptSig.asm);
            //get previous transaction vout from DB
            const preTx = await this.transactionService.getVOUtDetails(vin.txid, vin.vout);
            let preTxAsset: string;
            let preTxAssetAmount: number;
            if (preTx) {
              //If previous transaction vout exist set asset and amount using it
              if (!Number(preTx.value)) {
                //if value is null or 0 then decrept the scriptSig to get the asset and amount
                const decodedScriptSig = decodeVOutAsm(preTx.scriptPubKey_asm);
                if (isNaN(decodedScriptSig.assetInfo.amount)) {
                  console.warn(
                    `Something went wrong for the transaction ${transaction.hash} :: ${vin.vout}`
                  );
                } else {
                  preTxAsset = decodedScriptSig.assetInfo.assetName;
                  preTxAssetAmount = decodedScriptSig.assetInfo.amount;
                }
              } else {
                preTxAsset = preTx.asset;
                preTxAssetAmount = Number(preTx.value);
              }
              if (
                transaction.hash ===
                'f8bf734f2cd4b2bf0f38a03668b5239dc39638252259fe849e2b1f829b34767b'
              ) {
                console.log('Pre DATA', preTxAsset, preTxAssetAmount);
              }
            } else {
              //get the tx from alreadyFetchedArray
              let preTxFromElectrum: any = alreadyFetchedTxs.find(
                (alreadyItem) => alreadyItem.txid === vin.txid
              );

              //If not found then get the tx from Electrum server and push it in alreadyFetchedArray
              if (!preTxFromElectrum) {
                preTxFromElectrum = await this.getTransactionDetails({ tx_hex: vin.txid });
                alreadyFetchedTxs.push(preTxFromElectrum);
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
                      preTxAssetAmount = Number(preTxVOut.scriptPubKey.asset.amount);
                    } else {
                      //else decode asm and get the asset and amount
                      const decodedScriptSig = decodeVOutAsm(preTxVOut.scriptPubKey.asm);
                      preTxAsset = decodedScriptSig.assetInfo.assetName;
                      preTxAssetAmount = decodedScriptSig.assetInfo.amount;
                    }
                  } else {
                    preTxAsset = 'EVR';
                    preTxAssetAmount = Number(outAmount.toString());
                  }
                }
              }
            }

            if (preTxAsset === 'EVR') {
              totalEVRInputAmount += preTxAssetAmount;
            }

            if (preTxAsset && preTxAssetAmount) {
              const alreadyExistMetadata = await this.transactionService.getTxMetadata({
                address: vinAddress,
                asset: preTxAsset,
                tx_hash: transaction.hash,
                sent: typeorm.Not(typeorm.IsNull())
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

        console.log('total amounts', totalEVRInputAmount, totalEVROutputAmount);
        const fees = totalEVRInputAmount - totalEVROutputAmount;
        transactionObj.fee = fees;
        const transactionDetails = await this.transactionService.saveTx(transactionObj);
        await this.transactionService.saveTxMetadata(transactionMetadatas, transactionDetails.id);
      }
    }
    return { unspents, transactions };
  }

  async getTransactionDetails({ tx_hex, verbose = true }: { tx_hex: string; verbose?: boolean }) {
    if (!this.electrumClient) {
      await this.defaultConnect();
    }
    const transaction = await this.electrumClient.blockchain_transaction_get(tx_hex, verbose);
    if (!transaction) {
      setTimeout(() => {
        return this.getTransactionDetails({ tx_hex });
      }, 5000);
    }
    return transaction;
  }

  async addUnSpent() {
    // const wallets = await this.walletService.getAllWallets({});
    const deriveds = await this.derivedService.getAllDerivedData({});

    const addresses = [
      // ...wallets.map((wallet) => wallet.address),
      ...deriveds.map((derived) => derived.address)
    ];
    await Promise.all([
      // wallets.map(async (wallet) => {
      //   await this.getTransaction({ pubkey: wallet.publicKey, addresses });
      // }),
      deriveds.map(async (derived) => {
        await this.getTransaction({ scripthash: derived.scripthash, addresses });
      })
    ]);

    return true;
  }

  async subscribeToScripthash(scripthashes: string[]) {
    const newScripthashes = scripthashes.filter(
      (scripthash) => !this.subscribedScriptHashes.has(scripthash)
    );

    return await Promise.all(
      newScripthashes.map(async (scripthash: string) => {
        const connectionString = getElectrumConnectionString(scripthash);
        const connectionData = connectionString.split(':');

        await this.elecrumClientConnect(connectionData[0], connectionData[1]);

        this.subscribedScriptHashes.add(scripthash);
        const subscribeResponse =
          await this.electrumClient.blockchain_scripthash_subscribe(scripthash);
        return {
          scripthash,
          subscribeResponse
        };
      })
    );
  }

  async broadcastTransaction(rawTx: string) {
    if (!this.electrumClient) {
      await this.defaultConnect();
    }
    const broadcastResponse = await this.electrumClient.blockchain_transaction_broadcast(rawTx);
    console.log('broadcast response', broadcastResponse);
    return broadcastResponse;
  }

  async backgroundRefreshBalances(derivedData: Array<Derived>, clientId: string) {
    try {
      // if (!this.electrumClient) {
      //   await this.defaultConnect()
      // }
      const groupedByWallet = derivedData.reduce((acc, derived) => {
        if (!acc[derived.walletId]) {
          acc[derived.walletId] = [];
        }
        acc[derived.walletId].push(derived);
        return acc;
      }, {});
      let sendNewBalance = false;

      const unsubscribeArray: string[] = [];
      for (const [walletId, deriveds] of Object.entries(groupedByWallet)) {
        // const xpubkey = walletId;
        let walletDeriveds = deriveds as Derived[];
        if (walletDeriveds.length > 100) {
          walletDeriveds = walletDeriveds.sort((a, b) => b.index - a.index);
        }
        let subscribeCount = 0;
        let lastIndexWithBalance = 0;
        let walletScripthashes = walletDeriveds.map((derived) => derived.scripthash);
        const subscriptionResults = await this.subscribeToScripthash(walletScripthashes);
        const walletAddresses = walletDeriveds.map((data) => data.address);

        for (const subscribeDerivationData of walletDeriveds) {
          const subscriptionResult = subscriptionResults.find(
            (derived) => derived.scripthash === subscribeDerivationData.scripthash
          );

          if (subscriptionResult) {
            if (
              subscribeCount >= 100 &&
              (subscribeDerivationData.status === subscriptionResult.subscribeResponse ||
                !subscriptionResult.subscribeResponse)
            ) {
              // unsubscribe
              unsubscribeArray.push(subscribeDerivationData.scripthash);
            }
            if (
              subscriptionResult.subscribeResponse &&
              subscribeDerivationData.status !== subscriptionResult.subscribeResponse
            ) {
              // status changed so update the derived data

              // update derived balance
              const balance = await this.getOnlyBalance({
                scripthash: subscribeDerivationData.scripthash
              });
              await this.derivedService.saveDerivedBalance(
                balance,
                subscribeDerivationData.scripthash,
                subscribeDerivationData.id
              );

              // update derived unspent transaction
              await this.getTransaction({
                scripthash: subscribeDerivationData.scripthash,
                addresses: walletAddresses
              });
              // update derived subscription status
              await this.derivedService.updateDerivedData({
                id: subscribeDerivationData.id,
                status: subscriptionResult.subscribeResponse as string
              });

              subscribeCount++;
              console.log(
                'TEST!!!!!!!!!!!!',
                subscribeDerivationData.index > lastIndexWithBalance,
                subscribeDerivationData.index,
                lastIndexWithBalance
              );
              if (subscribeDerivationData.index > lastIndexWithBalance) {
                lastIndexWithBalance = subscribeDerivationData.index;
              }
            }
          }
        }

        // if there is any derived with balance then fetch the derivations
        console.log('lastIndexWithBalance', lastIndexWithBalance);
        if (lastIndexWithBalance) {
          const response: any = await this.pubsubService.requestFromMaster({
            type: 'walletDetails',
            request: {
              id: parseInt(walletId)
            }
          });
          if (response?.data) {
            console.log('respomse', response.data);
            await this.derivations(
              {
                publicKey: response.data.publicKey,
                id: response.data.id
              },
              lastIndexWithBalance + 1
            );
            sendNewBalance = true;
          }
        }
      }
      if (sendNewBalance && clientId) {
        const derivedScriptHashes = derivedData.map((derived) => derived.scripthash);
        const balanceFromScriptHashes =
          await this.derivedService.balanceFromScriptHashes(derivedScriptHashes);
        // send new balance to the client using socket
        await this.pubsubService.requestFromMaster({
          type: 'balance_update',
          request: {
            clientId,
            balance: balanceFromScriptHashes.summedBalances
          }
        });
      }
      this.unSubscribe(unsubscribeArray);
    } catch (e) {
      console.log('Error:- background refresh', e);
    }
  }

  async handleSubscribeMessage(scripthash: string, status: string) {
    // Todo: check if all the addresses can be get is fisible or not
    console.log('Received status update for scripthash:', scripthash, status);
    const balance = await this.getBalance({ scripthash });
    await this.derivedService.saveDerivedBalance(balance, scripthash);
    await this.getTransaction({ scripthash });
  }
}
