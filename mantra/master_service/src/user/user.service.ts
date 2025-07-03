import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';
import { WalletService } from '../wallet/wallet.service';
import { ElectrumXService } from '../socket/socket-client.serve';
import { MasterService } from '../socket/pubsub.service';
import { IDerived } from '../utils/interfaces';
import { SocketService } from '../socket/socket.service';
import { getDerivedData } from 'src/utils/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as _ from 'lodash';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private walletService: WalletService,
    private webSocketClientService: ElectrumXService,
    private masterService: MasterService,
    private socketService: SocketService
  ) {}

  async findAll(): Promise<User[]> {
    return await this.userRepository.find();
  }
  // async test() {
  //   console.log('test');
  //   return this.webSocketClientService.queryAssetService('EVR', {});
  // }

  async refreshBalances({
    clientId,
    pubkeys,
    scriptHashes,
    deviceId
  }: {
    clientId: string;
    pubkeys: Array<string>;
    scriptHashes: Array<string>;
    deviceId?: string;
  }) {
    const scriptHashesArray = [];
    const derivedDataArray = [];
    let walletIds;
    const connectedServices: string[] = [...new Set(global.connectedServices as string[])];
    console.log('Connected Services', connectedServices);
    if (pubkeys?.length) {
      let wallets = await this.walletService.getAllWallets({ pubkeys });
      if (!wallets.length) {
        wallets = await Promise.all(
          pubkeys.map((pubkey) => this.webSocketClientService.derivedData(pubkey))
        );
      }
      // let walletIds = [];
      walletIds = wallets.map((wallet) => wallet.id);
      for (const service of connectedServices) {
        const derivedData = await this.masterService.queryAssetService(service, {
          type: 'getDerivations',
          request: {
            walletIds
          }
        });
        scriptHashesArray.push(...derivedData.map((derived) => derived.scripthash));
        derivedData.map((elem) => {
          const pushData = {
            chainName: service,
            ...elem
          };
          derivedDataArray.push(pushData);
        });
      }
      if (deviceId) {
        //TODO : updateWalletDeviceID
      }
    }
    if (scriptHashes?.length) {
      for (const service of connectedServices) {
        const derivedData = await this.masterService.queryAssetService(service, {
          type: 'getDerivations',
          request: {
            keyPairs: scriptHashes
          }
        });
        console.log('data from the scripthash', derivedData);
        scriptHashesArray.push(...derivedData.map((derived) => derived.scripthash));
        derivedData.map((elem) => {
          const pushData = {
            chainName: service,
            ...elem
          };
          derivedDataArray.push(pushData);
        });
      }
    }

    if (derivedDataArray.length) {
      const { summedBalances, derivedData, balanceAddresses } =
        await this.balanceFromScriptHashes(derivedDataArray);
      for (const service of connectedServices) {
        this.masterService.queryAssetService(service, {
          type: 'updateBackgroundData',
          request: {
            clientId,
            walletIds
          }
        });
      }
      // this.backgroundRefreshBalances(derivedData, clientId);

      console.log('Summed Balances', summedBalances);
      const resrutcureBalance = Object.entries(summedBalances).map(([symbol, balance]) => {
        const [chain, asset] = symbol.split(':');
        return JSON.stringify({
          id: null,
          error: null,
          satsConfirmed: balance['confirmed'],
          satsUnconfirmed: balance['unconfirmed'],
          symbol: asset,
          chain: chain === 'RVN' ? 'ravencoin_mainnet' : 'evrmore_mainnet'
        });
      });
      return { balance: resrutcureBalance, balanceAddresses };
    } else {
      for (const service of connectedServices) {
        this.masterService.queryAssetService(service, {
          type: 'updateBackgroundData',
          request: {
            clientId,
            walletIds
          }
        });
      }
      return {
        balance: [
          '{"id":null,"error":null,"satsConfirmed":0,"satsUnconfirmed":0,"symbol":"EVR","chain":"evrmore_mainnet"}',
          '{"id":null,"error":null,"satsConfirmed":0,"satsUnconfirmed":0,"symbol":"RVN","chain":"ravencoin_mainnet"}'
        ],
        balanceAddresses: {}
      };
    }
  }

  async balanceFromScriptHashes(derivedData: Array<any>) {
    let summedBalances = {};
    let balanceAddresses = {};
    await Promise.all(
      derivedData.map((derived) => {
        const balances = derived.derivedBalance;
        const chainName = derived.chainName;
        balances.map((balance) => {
          const { asset, satsConfirmed, satsUnconfirmed } = balance;

          if (!summedBalances[`${chainName}:${asset}`]) {
            summedBalances[`${chainName}:${asset}`] = { confirmed: 0, unconfirmed: 0 };
          }
          summedBalances[`${chainName}:${asset}`].confirmed +=
            parseInt(satsConfirmed.toString()) || 0;
          summedBalances[`${chainName}:${asset}`].unconfirmed +=
            parseInt(satsUnconfirmed.toString()) || 0;

          if (parseInt(satsConfirmed.toString()) > 0 || parseInt(satsUnconfirmed.toString()) > 0) {
            console.log('Data', asset, satsConfirmed, satsUnconfirmed);
            if (!balanceAddresses[asset]) {
              balanceAddresses[asset] = [derived.address];
            } else {
              if (!balanceAddresses[asset].includes(derived.address)) {
                balanceAddresses[asset].push(derived.address);
              }
            }
          }
        });
      })
    );

    return { summedBalances, derivedData, balanceAddresses };
  }

  async backgroundRefreshBalances(derivedData: Array<IDerived>, clientId?: string) {
    try {
      const groupedByWallet = derivedData.reduce((acc, derived) => {
        if (!acc[derived.walletId]) {
          acc[derived.walletId] = [];
        }
        acc[derived.walletId].push(derived);
        return acc;
      }, {});
      let sendNewBalance = false;

      const unsubscribeArray: string[] = [];
      const derivedBalances: any = [];
      const derivedUnspents: any = [];
      for (const [walletId, deriveds] of Object.entries(groupedByWallet)) {
        const xpubkey = walletId;
        let walletDeriveds = deriveds as IDerived[];
        if (walletDeriveds.length > 100) {
          walletDeriveds = walletDeriveds.sort((a, b) => b.index - a.index);
        }
        let subscribeCount = 0;
        let lastIndexWithBalance;
        let walletScripthashes = (deriveds as IDerived[]).map((derived) => derived.scripthash);

        const subscriptionResults =
          await this.webSocketClientService.subscribeToScripthash(walletScripthashes);

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

            // if (
            //   subscriptionResult.subscribeResponse &&
            //   subscribeDerivationData.status !== subscriptionResult.subscribeResponse
            // ) {
            // get balance
            const balance = await this.webSocketClientService.getOnlyBalance({
              scripthash: subscribeDerivationData.scripthash
            });
            // TODO: update derived balance
            derivedBalances.push({
              balance,
              scripthash: subscribeDerivationData.scripthash,
              derivedId: subscribeDerivationData.id,
              status: subscriptionResult.subscribeResponse as string
            });
            // get unspent
            const unspents = await this.webSocketClientService.getUnspentTransactions({
              scripthash: subscribeDerivationData.scripthash
            });
            // TODO: update derived unspent/vins/vouts
            derivedUnspents.push({
              unspents,
              scripthash: subscribeDerivationData.scripthash,
              derivedId: subscribeDerivationData.id
            });
            // TODO: update derived subscription status
            if (subscribeDerivationData.index > lastIndexWithBalance) {
              lastIndexWithBalance = subscribeDerivationData.index;
            }
            subscribeCount++;
          }
          // }
        }
        console.log('Pre DATA', derivedBalances, derivedUnspents);

        // if there is any derived with balance then fetch the derivations
        if (lastIndexWithBalance) {
          await this.derivations(xpubkey, lastIndexWithBalance);
          sendNewBalance = true;
        }
      }

      let unspentTransactionDetails = [];
      if (derivedUnspents?.length) {
        await Promise.all(
          derivedUnspents.map((item) =>
            Promise.all(
              item.unspents.map(async (elem) => {
                const txDetails = await this.webSocketClientService.getTransactionDetails({
                  tx_hex: elem.tx_hash,
                  verbose: true
                });
                unspentTransactionDetails.push({
                  unspentDetails: txDetails,
                  scripthash: item.scripthash,
                  derivedId: item.derivedId
                });
              })
            )
          )
        );
      }

      this.masterService.queryAssetService('EVR', {
        type: 'updateBackgroundData',
        request: {
          derivedData: derivedBalances,
          unspents: {
            walletIds: derivedData.map((derived) => derived.walletId),
            derivedTransaction: unspentTransactionDetails
          }
        }
      });

      if (clientId) {
        if (sendNewBalance && global.socketClients[clientId] && global.socket) {
          const derivedScriptHashes = derivedData.map((derived) => derived.scripthash);
          const balanceFromScriptHashes = await this.balanceFromScriptHashes(derivedData);
          // send new balance to the client using socket
          this.socketService.sendMessageToRoom(clientId, 'balance_update', {
            balance: balanceFromScriptHashes.summedBalances
          });

          global.socketClients[clientId].scriptHashes = derivedScriptHashes;
        }
      }

      this.webSocketClientService.unSubscribe(unsubscribeArray);
    } catch (e) {
      console.log('Error:- background refresh', e);
    }
  }

  async derivations(xpubkey: string, lastIndexWithBalance: number = 0) {
    try {
      let walletData = await this.walletService.getWalletData({ key: xpubkey });
      if (!walletData) {
        walletData = await this.webSocketClientService.derivedData(xpubkey);
      }
      const derivationsPerExposure = 20;
      // if (!this.electrumClient) {
      //   await this.elecrumClientConnect('146.190.38.120', '50002');
      // }
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
      let newLastIndexWithBalance;
      const derivedChildren = [];
      await Promise.all(
        derivedAddresses.map(async (derivedElement) => {
          const balance = await this.webSocketClientService.getOnlyBalance({
            scripthash: derivedElement.scripthash
          });
          const isBalanceChanged = Object.keys(balance).length > 0;
          if (derivedElement.index > newLastIndexWithBalance && isBalanceChanged) {
            newLastIndexWithBalance = derivedElement.index;
          }

          derivedChildren.push({
            derivedData: derivedElement,
            balance
          });
        })
      );

      let returnValue = derivedAddresses;
      if (newLastIndexWithBalance) {
        returnValue = returnValue.concat(await this.derivations(xpubkey, newLastIndexWithBalance));
      }
      await this.masterService.queryAssetService('EVR', {
        type: 'saveDerivedChildren',
        request: returnValue
      });
      return returnValue;
    } catch (error) {
      console.log('Error:- derivations', error);
      throw error;
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async refreshBalanceCron() {
    const wallets = await this.walletService.getAllWallets({});
    const walletIds = wallets.map((wallet) => wallet.id);

    const connectedServices = [...new Set(global.connectedServices as string[])];
    for (const service of connectedServices) {
      this.masterService.queryAssetService(service, {
        type: 'updateBackgroundData',
        request: {
          walletIds
        }
      });
    }
  }

  async test() {
    // this.masterService.queryAssetService('EVR', {
    //   type: 'updateBackgroundData',
    //   request: {
    //     walletIds: [14]
    //   }
    // });
    this.refreshBalanceCron();
  }
}
