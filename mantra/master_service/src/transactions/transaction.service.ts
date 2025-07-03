import { Inject, forwardRef, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { WalletService } from '../wallet/wallet.service';
// import * as evrmore from 'evrmorejs-lib';
import * as bitcoin from 'bitcoinjs-lib';
import {
  createH160Address,
  decodeVOutAsm,
  estimateFeeForFeerate,
  evrmoreNetwork,
  fromAddress,
  getAddressFromScriptSig,
  getInputType,
  getVinLockingScriptType,
  lengthOfVarInt,
  ScriptType,
  serialize,
  sizeForVin,
  validateInput
} from '../utils/common';
import { ElectrumXService } from '../socket/socket-client.serve';
// import * as crypto from 'crypto';
import ecc from '@bitcoinerlab/secp256k1';
import { MasterService } from '../socket/pubsub.service';
import { IBlockchainUnSpent, IBlockchainVOut, IDerived } from 'src/utils/interfaces';

@Injectable()
export class TransactionService {
  constructor(
    private walletService: WalletService,
    @Inject(forwardRef(() => ElectrumXService)) // Ensure this is correct
    private readonly webSocketClientService: ElectrumXService,
    private masterService: MasterService
  ) {}

  async getTransactionHistories({
    symbol,
    xpubkeys,
    scripthashes,
    limit = 10,
    offset = 0,
    chainName
  }: {
    symbol: string;
    chainName: string;
    xpubkeys?: string[];
    scripthashes?: string[];
    limit?: number;
    offset?: number;
  }) {
    try {
      const connectedServices: string[] = [...new Set(global.connectedServices as string[])];
      if (!connectedServices.includes(chainName)) {
        throw new Error(`Chain ${chainName} is not connected`);
      }

      const wallets = await this.walletService.getAllWallets({
        pubkeys: xpubkeys
      });
      const walletIds = wallets.map((elem) => elem.id);
      const result = await this.masterService.queryAssetService(chainName, {
        type: 'getTransactionHistory',
        request: {
          walletIds,
          scripthashes,
          symbol,
          limit,
          offset
        }
      });
      console.log('result', result);
      return result;
    } catch (e) {
      console.error(`Error:- getTransactionHistories:- ${e}`);
      throw new Error(e);
    }
  }

  async createTransaction({
    xpubkeys,
    scripthashes,
    eachOutputAddress,
    eachOutputAsset,
    eachOutputAmount,
    eachOutputAssetMemo,
    eachOutputAssetMemoTimestamp,
    changeSource,
    chainName,
    feeRateKb
  }: {
    xpubkeys: string[];
    scripthashes: string[];
    eachOutputAddress: string[];
    eachOutputAsset: string[];
    eachOutputAmount: number[];
    eachOutputAssetMemo: string[];
    eachOutputAssetMemoTimestamp: number[];
    changeSource: string;
    chainName: string;
    feeRateKb: number;
  }) {
    try {
      const wallets = await this.walletService.getAllWallets({
        pubkeys: xpubkeys
      });
      const responseFromAsset = await this.masterService.queryAssetService(chainName, {
        type: 'createTransaction',
        request: {
          walletData: wallets.map((item) => ({ id: item.id, publicKey: item.publicKey })),
          scripthashes,
          eachOutputAddress,
          eachOutputAsset,
          eachOutputAmount,
          eachOutputAssetMemo,
          eachOutputAssetMemoTimestamp,
          changeSource,
          feeRateKb
        }
      });
      return responseFromAsset;
    } catch (e: any) {
      console.error(`Error:- create new transaction:- ${e}`);
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
    outputDerivedData
  }) {
    try {
      const inputArray = [];
      const inputUTXOs = [];
      const outputArray = [];
      const changeSourceData: IDerived = outputDerivedData.find(
        (outputElem) => outputElem.address === changeSource
      );
      comprisedOutputs.forEach((outputElem) => {
        let filterUTXOs = utxos.filter((utxo) => (utxo.asset || 'EVR') === outputElem.asset);
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
        const lessValueUTXOs = filterUTXOs
          .filter((elem) => elem.value < outputElem.amount)
          .sort((a, b) => b.value - a.value);
        if (moreValueUTXOs.length) {
          for (const utxo of moreValueUTXOs) {
            const voutObject = vouts.find(
              (vout) => vout?.tx_hash === utxo?.tx_hash && vout?.node === utxo?.tx_pos
            );
            if (!voutObject) {
              throw new Error('Vout not found for UTXO');
            }
            if (outputElem.amount > spentAmount || !spentAmount) {
              const inputObj = {
                hash: Buffer.from(utxo.tx_hash, 'hex'),
                index: utxo.tx_pos,
                script: new Uint8Array(0),
                sequence: 0xffffffff

                // witnessUtxo: {
                //   script: Buffer.from(voutObject.scriptPubKey_hex, 'hex'),
                //   value: utxo.value
                // }
              };
              // Validate input object
              if (!validateInput(inputObj)) {
                throw new Error(`Invalid input: ${JSON.stringify(inputObj)}`);
              }

              inputArray.push(inputObj);
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
                tx_hash: utxo.tx_hash,
                pos: utxo.tx_pos
              });
            } else {
              break;
            }
          }
        }
        if (
          (!moreValueUTXOs.length || outputElem.amount > spentAmount || !spentAmount) &&
          lessValueUTXOs.length
        ) {
          for (const utxo of lessValueUTXOs) {
            const voutObject = vouts.find(
              (vout) => vout?.tx_hash === utxo?.tx_hash && vout?.node === utxo?.tx_pos
            );
            if (!voutObject) {
              throw new Error('Vout not found for UTXO');
            }
            if (outputElem.amount > spentAmount || !spentAmount) {
              const inputObj = {
                hash: Buffer.from(utxo.tx_hash, 'hex'),
                index: utxo.tx_pos,
                script: new Uint8Array(0),
                sequence: 0xffffffff
                // witnessUtxo: {
                //   script: Buffer.from(voutObject.scriptPubKey_hex, 'hex'),
                //   value: utxo.value
                // }
              };
              // Validate input object
              if (!validateInput(inputObj)) {
                throw new Error(`Invalid input: ${JSON.stringify(inputObj)}`);
              }

              inputArray.push(inputObj);
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
                tx_hash: utxo.tx_hash,
                pos: utxo.tx_pos
              });
            } else {
              break;
            }
          }
        }

        const fromAddressResponse = fromAddress({
          address: outputElem.address,
          amount: outputElem.amount,
          asset: outputElem.asset,
          memo: outputElem.memo,
          timestamp: outputElem.timestamp
        });

        // console.log('fromAddressResponse', fromAddressResponse);
        // const complileArray = [
        //   Buffer.from(bitcoin.opcodes.OP_RVN_ASSET?.toString()), // Asset Operation Identifier
        //   Buffer.from(outputElem.asset, 'utf8'), // Asset name
        //   bitcoin.script.number.encode(outputElem.amount) // Amount
        // ];
        // if (outputElem.memo) {
        //   complileArray.push(Buffer.from(outputElem.memo, 'utf8')); // Memo
        // }
        // if (outputElem.timestamp) {
        //   complileArray.push(bitcoin.script.number.encode(outputElem.timestamp)); // Memo timestamp
        // }

        // complileArray.push(bitcoin.address.toOutputScript(outputElem.address, evrmoreNetwork()));
        // const outputObjSctipt = Buffer.concat(complileArray);

        // console.log('outputObjSctipt', outputObjSctipt);

        const outputDerivationData: IDerived = outputDerivedData.find(
          (outputElement) => outputElem.address === outputElement.address
        );
        const outputObj = {
          address: createH160Address(outputDerivationData?.pubkey),
          value: outputElem.amount,
          script: fromAddressResponse,
          metadata: {
            sats: outputElem.amount,
            asset: outputElem.asset,
            memo: outputElem.memo,
            timestamp: outputElem.timestamp,
            address: outputElem.address
          }
        };
        outputArray.push(outputObj);
        console.log('SPENT', spentAmount, outputElem.amount, estimationFees);
        const changeOutputAmount =
          spentAmount -
          outputElem.amount -
          (outputElem.asset === 'EVR' || !outputElem.asset ? estimationFees : 0);
        console.log('ChangeOutPUTAMOUNT :::::: ', changeOutputAmount);
        // console.log(bitcoin.opcodes, bitcoin.opcodes.OP_RVN_ASSET);
        // const outputScript = Buffer.concat([
        //   Buffer.from(bitcoin.opcodes.OP_RVN_ASSET?.toString()),
        //   Buffer.from(outputElem.asset, 'utf8'),
        //   bitcoin.script.number.encode(changeOutputAmount),
        //   bitcoin.address.toOutputScript(changeSource, evrmoreNetwork())
        // ]);
        // console.log('OutPUT-Script', outputScript);
        if (changeOutputAmount > 0) {
          const changeFromAddressResponse = fromAddress({
            address: outputElem.address, // TODO: change it to changeSource
            amount: changeOutputAmount,
            asset: outputElem.asset // TODO: change it to changeSource asset
          });
          const changeOutputObj = {
            address: createH160Address(changeSourceData?.pubkey),
            value: changeOutputAmount,
            script: changeFromAddressResponse,
            metadata: {
              sats: changeOutputAmount,
              asset: outputElem.asset,
              changeSource: '',
              // address: changeSource
              address: outputElem.address
            }
          };
          outputArray.push(changeOutputObj);
        }
      });
      const feeRate = 1000001;
      if (!eachOutputAsset.includes('EVR')) {
        const EVRUTXOs = utxos
          .filter((utxo) => utxo.asset === 'EVR' || !utxo.asset)
          .sort((a, b) => b.value - a.value);
        let spentFeesAmount = 0;
        if (EVRUTXOs.length) {
          for (const utxo of EVRUTXOs) {
            const voutObject = vouts.find(
              (vout) => vout?.tx_hash === utxo?.tx_hash && vout?.node === utxo?.tx_pos
            );
            if (!voutObject) {
              throw new Error('Vout not found for UTXO');
            }
            if (estimationFees > spentFeesAmount || !spentFeesAmount) {
              const inputObj = {
                hash: Buffer.from(utxo.tx_hash, 'hex'),
                index: utxo.tx_pos,
                script: new Uint8Array(0),
                sequence: 0xffffffff
                // witnessUtxo: {
                //   script: Buffer.from(voutObject.scriptPubKey_hex, 'hex'),
                //   value: utxo.value
                // }
              };
              // Validate input object
              if (!validateInput(inputObj)) {
                throw new Error(`Invalid input: ${JSON.stringify(inputObj)}`);
              }

              inputArray.push(inputObj);
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
                tx_hash: utxo.tx_hash,
                pos: utxo.tx_pos
              });
            } else {
              break;
            }
          }
        }

        const changeOutputAmount = spentFeesAmount - estimationFees;
        console.log('changeOutputAmountFees', changeOutputAmount);
        // const outputScript = Buffer.concat([
        //   Buffer.from(bitcoin.opcodes.OP_RVN_ASSET?.toString()),
        //   Buffer.from('EVR', 'utf8'),
        //   bitcoin.script.number.encode(changeOutputAmount),
        //   bitcoin.address.toOutputScript(changeSource, evrmoreNetwork())
        // ]);
        // console.log('OutPUT-Script', outputScript);

        const changeFromAddressResponse = fromAddress({
          address: comprisedOutputs[0].address, // TODO: change it to changeSource
          amount: changeOutputAmount,
          asset: 'EVR' // TODO ::hange to EVR
        });
        const changeOutputObj = {
          address: createH160Address(changeSourceData?.pubkey),
          value: changeOutputAmount,
          script: changeFromAddressResponse,
          metadata: {
            sats: changeOutputAmount,
            asset: 'SATORI',
            changeSource: '',
            // address: changeSource
            address: comprisedOutputs[0].address
          }
        };
        outputArray.push(changeOutputObj);
      }
      // const globalXpubArray = [];
      // inputUTXOs.map((elem) => {
      //   const masterFingerprint = this.getMasterFingerprint(elem.walletPubKey);
      //   const globalXpubObj = {
      //     masterFingerprint: Buffer.from(masterFingerprint, 'hex'),
      //     extendedPubkey: Buffer.from(elem.walletPubKey, 'base64'),
      //     path: `m/44'/175'/0'/${elem.index}`
      //   };
      //   globalXpubArray.push(globalXpubObj);
      // });
      // console.log('GlobalXPub', globalXpubArray);

      const totalVinSize: number = inputUTXOs.map(sizeForVin).reduce((acc, curr) => acc + curr, 0);
      console.log('totalVinSize', totalVinSize);

      const transactinoTypeTrans = await this.createTransactionType(inputArray, outputArray);
      const transationWeight: number = await this.calculateTransactionWeight(transactinoTypeTrans);
      const calculatedTransactionFees = estimateFeeForFeerate(
        transationWeight + 4 * (lengthOfVarInt(inputUTXOs.length) + totalVinSize),
        feeRate
      );
      console.log('calculatedTransactionFees', calculatedTransactionFees);

      if (estimationFees !== calculatedTransactionFees) {
        return this.generateTransaction({
          comprisedOutputs,
          comprisedChildren,
          utxos,
          estimationFees: calculatedTransactionFees,
          changeSource,
          eachOutputAsset,
          vouts,
          outputDerivedData
        });
      } else {
        const newTransaction = await serialize(inputArray, outputArray);
        return {
          // txHex: transactinoTypeTrans.toHex(),
          txHex: newTransaction.toString('hex'),
          targetFee: calculatedTransactionFees,
          transactionFees: calculatedTransactionFees,
          vinPrivateKeySource: inputUTXOs.map((elem) => `${elem.walletPubKey}:${elem.index}`),
          vinAmounts: inputUTXOs.map((elem) => elem.amount),
          vinAssets: inputUTXOs.map((elem) => elem.asset),
          vinLockingScriptType: inputUTXOs.map((elem) => getVinLockingScriptType(elem.inputType)),
          vinScriptOverride: inputUTXOs.map(() => null),
          changeSource: inputUTXOs.map(() => createH160Address(changeSourceData?.pubkey))
        };
      }
    } catch (e) {
      console.log('Error', e);
      throw new Error(e);
    }
  }

  async createTransactionType(inputArray, outputArray) {
    const transaction = new bitcoin.Transaction();

    await Promise.all([
      inputArray.map((input, index) => {
        transaction.addInput(input.hash, input.index);
        // transaction.setWitness(index, input.witnessUtxo);
      }),
      outputArray.map((output) => {
        console.log('OUTPUT', output);
        transaction.addOutput(output.script, output.value);
      })
    ]);

    console.log('transaction obj', transaction);
    return transaction;
  }

  async calculateTransactionWeight(transaction: bitcoin.Transaction): Promise<number> {
    const inputCount = transaction.ins.length;
    const outputCount = transaction.outs.length;

    // Calculate the size of the transaction
    const size = transaction.byteLength();

    // Estimate the weight of signatures (assuming 72 bytes per signature)
    // const estimatedSignatureWeight = inputCount * 108;
    // Calculate the weight
    // const weight = size * 3 + inputCount * 148 + outputCount * 34 + 10 + estimatedSignatureWeight; // 10 bytes for base weight
    const weight = size * 3 + inputCount * 148 + outputCount * 34 + 10; // 10 bytes for base weight

    return weight;
  }

  async fetchAndUpdateUnspents(scripthashes: string[], walletIds: number[]) {
    try {
      const derivedUnspents: any = [];
      await Promise.all(
        scripthashes.map(async (scripthash) => {
          const unspents = await this.webSocketClientService.getUnspentTransactions({
            scripthash: scripthash
          });

          derivedUnspents.push({
            unspents,
            scripthash: scripthash
            // derivedId: subscribeDerivationData.id
          });
        })
      );

      let unspentTransactionDetails = [];
      if (derivedUnspents?.length) {
        unspentTransactionDetails = await Promise.all(
          derivedUnspents.map((item) =>
            item.unspents.map(async (elem) => {
              const txDetails = await this.webSocketClientService.getTransactionDetails({
                tx_hex: elem.tx_hash,
                verbose: true
              });
              return {
                details: txDetails,
                scripthash: item.scripthash,
                derivedId: item?.derivedId
              };
            })
          )
        );
      }
      this.masterService.queryAssetService('EVR', {
        type: 'updateBackgroundData',
        request: {
          unspents: {
            walletIds,
            derivedTransaction: unspentTransactionDetails
          }
        }
      });

      const utxos = [];
      const vouts = [];
      await Promise.all(
        unspentTransactionDetails.map(async (item) => {
          for (const unspentTx of item.details) {
            const utxoObj: IBlockchainUnSpent = {
              asset: unspentTx.asset,
              value: unspentTx.value,
              tx_hash: unspentTx.tx_hash,
              tx_pos: unspentTx.tx_pos,
              walletId: unspentTx.walletId,
              derivedId: unspentTx.derivedId,
              height: unspentTx.height
            };
            utxos.push(utxoObj);
            const transactionVouts = unspentTx?.vout;
            if (transactionVouts?.length) {
              for (const vout of transactionVouts) {
                const voutObj: IBlockchainVOut = {
                  tx_hash: unspentTx.tx_hash,
                  node: vout.n,
                  value: vout?.scriptPubKey?.amount ?? vout.valueSat,
                  asset: vout?.scriptPubKey?.asset?.name ?? 'EVR'
                };
                if (vout.scriptPubKey) {
                  voutObj.scriptPubKey_asm = vout.scriptPubKey.asm;
                  voutObj.scriptPubKey_hex = vout.scriptPubKey.hex;
                  voutObj.scriptPubKey_reqSigs = vout.scriptPubKey.reqSigs;
                  voutObj.scriptPubKey_type = vout.scriptPubKey.type;
                  voutObj.scriptPubKey_addresses = vout.scriptPubKey.addresses;
                }

                vouts.push(voutObj);
              }
            }
          }
        })
      );
      return { utxos, vouts };
    } catch (error: any) {
      console.log('Error fetching unspents', error);
      return {
        utxos: [],
        vouts: []
      };
    }
  }

  async broadcastTransaction(chainName: string, rawTx: string) {
    try {
      const assetResponse = await this.masterService.queryAssetService(chainName, {
        type: 'broadcastTransaction',
        request: {
          rawTx
        }
      });

      console.log('assetResponse', assetResponse);
      if (assetResponse?.error) {
        throw new Error(assetResponse?.error?.message);
      }
      return assetResponse;
    } catch (error) {
      console.log('Error broadcasting transaction', error);
      throw new Error('Error broadcasting transaction');
    }
  }
}
