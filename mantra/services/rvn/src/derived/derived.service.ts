import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Derived } from './derived.entity';
import { DerivedBalance } from './derived_balance.entity';
import { ElectrumXService } from '../socket/socket-client.serve';
import { AssetService } from '../socket/pubsub.service';
import { getChildFromKeypair } from '../utils/common';

@Injectable()
export class DerivedService {
  constructor(
    @InjectRepository(Derived)
    private derivedRepository: Repository<Derived>,
    @InjectRepository(DerivedBalance)
    private derivedBalanceRepository: Repository<DerivedBalance>,
    @Inject(forwardRef(() => ElectrumXService))
    private webSocketClientService: ElectrumXService,
    @Inject(forwardRef(() => AssetService))
    private pubsubService: AssetService
  ) {}

  async addDerivedData(data: Derived): Promise<Derived> {
    const derivedData = new Derived();
    derivedData.address = data.address;
    derivedData.pubkey = data.pubkey;
    derivedData.scripthash = data.scripthash;
    derivedData.walletId = data.walletId;
    // derivedData.exposure = data.exposure;
    derivedData.index = data.index;
    console.log('derivation', derivedData);

    return this.derivedRepository.save(derivedData);
  }

  async updateDerivedData(data: { id?: number; key?: string; status: string }): Promise<Derived> {
    let condition: any = {};
    if (data.id) {
      condition = { id: data.id };
    }
    if (data.key) {
      condition = { pubkey: data.key };
    }
    const derivedData = await this.getDerivedData(condition);
    if (!derivedData) {
      throw new Error('Derived data not found');
    }
    derivedData.status = data.status;
    return this.derivedRepository.save(derivedData);
  }

  async getDerivedData({ key, id }: { key?: string; id?: number }): Promise<Derived> {
    let condition: any = {};
    if (key) {
      condition = [{ pubkey: key }, { address: key }, { scripthash: key }];
    }
    if (id) {
      condition = { id };
    }
    return this.derivedRepository.findOne({
      where: condition,
      select: {
        id: true,
        scripthash: true,
        walletId: true,
        status: true,
        index: true,
        pubkey: true
      }
    });
  }

  async getAllDerivedData({
    walletId,
    walletIds,
    scripthashes,
    keys,
    keyPairs
  }: {
    walletId?: number;
    walletIds?: number[];
    scripthashes?: string[];
    keys?: string[];
    keyPairs?: any[];
  }): Promise<Derived[]> {
    let condition: any = {};
    if (walletId) {
      condition = { walletId };
    }
    if (walletIds) {
      condition = { walletId: In(walletIds) };
    }
    if (scripthashes) {
      condition = { scripthash: In(scripthashes) };
    }
    if (keys) {
      condition = [{ pubkey: In(keys) }, { address: In(keys) }, { scripthash: In(keys) }];
    }
    if (keys?.length && walletIds?.length) {
      condition = [
        { walletId: In(walletIds) },
        { pubkey: In(keys) },
        { address: In(keys) },
        { scripthash: In(keys) }
      ];
    }
    if (keyPairs?.length) {
      const fetchedScripthash = [];
      await Promise.all(
        keyPairs.map((item) => {
          const fetchedResult = getChildFromKeypair(item);

          if (fetchedResult) {
            fetchedScripthash.push(fetchedResult.scripthash);
          }
        })
      );

      condition = { scripthash: In(fetchedScripthash) };
    }
    return this.derivedRepository.find({
      where: condition,
      relations: {
        derivedBalance: true
      },
      select: {
        id: true,
        scripthash: true,
        walletId: true,
        status: true,
        index: true,
        address: true,
        pubkey: true,
        derivedBalance: {
          asset: true,
          satsConfirmed: true,
          satsUnconfirmed: true
        }
      }
    });
  }

  async saveDerivedBalance(balance: any, scripthash?: string, derivedId?: number): Promise<void> {
    let derivedID;
    if (derivedId) {
      derivedID = derivedId;
    } else if (scripthash) {
      derivedID = (await this.getDerivedData({ key: scripthash })).id;
    } else {
      console.log('derivedId or scripthash is required');
      return;
    }
    const alreadyExistBalance: DerivedBalance[] = await this.derivedBalanceRepository.find({
      where: { derivedId: derivedID }
    });
    let isRVNOnlyBalance = false;
    if (balance.hasOwnProperty('confirmed') && balance.hasOwnProperty('unconfirmed')) {
      isRVNOnlyBalance = true;
    }
    if (alreadyExistBalance.length) {
      for (const existingBalance of alreadyExistBalance) {
        const balanceAsset = existingBalance.asset;
        if (isRVNOnlyBalance && balanceAsset === 'RVN') {
          existingBalance.satsConfirmed = balance.confirmed;
          existingBalance.satsUnconfirmed = balance.unconfirmed;
          await this.derivedBalanceRepository.save(existingBalance);
        } else if (isRVNOnlyBalance && balanceAsset !== 'RVN') {
          existingBalance.satsConfirmed = 0;
          existingBalance.satsUnconfirmed = 0;
          await this.derivedBalanceRepository.save(existingBalance);
        } else {
          let balanceKey = balanceAsset === 'RVN' ? 'rvn' : balanceAsset;
          const newBalance = balance[balanceKey];
          if (newBalance) {
            existingBalance.satsConfirmed = newBalance.confirmed;
            existingBalance.satsUnconfirmed = newBalance.unconfirmed;
            await this.derivedBalanceRepository.save(existingBalance);
          } else {
            existingBalance.satsConfirmed = 0;
            existingBalance.satsUnconfirmed = 0;
            await this.derivedBalanceRepository.save(existingBalance);
          }
        }
      }
    }
    if (balance.hasOwnProperty('confirmed') && balance.hasOwnProperty('unconfirmed')) {
      const isBalanceExist = alreadyExistBalance?.find(
        (elem) => elem.derivedId === derivedID && elem.asset === 'RVN'
      );

      if (!isBalanceExist) {
        const derivedBalance = new DerivedBalance();
        derivedBalance.satsConfirmed = balance.confirmed;
        derivedBalance.satsUnconfirmed = balance.unconfirmed;
        derivedBalance.derivedId = derivedID;
        await this.derivedBalanceRepository.save(derivedBalance);
      } else {
        isBalanceExist.satsConfirmed = balance.confirmed;
        isBalanceExist.satsUnconfirmed = balance.unconfirmed;
        await this.derivedBalanceRepository.save(isBalanceExist);
      }
    } else {
      for (const [key, value] of Object.entries(balance)) {
        const isBalanceExist = alreadyExistBalance.find(
          (elem) =>
            elem.derivedId === derivedID &&
            elem.asset === (key.toLowerCase() !== 'rvn' ? key : 'RVN')
        );
        if (!isBalanceExist) {
          const derivedBalance = new DerivedBalance();
          derivedBalance.asset = key.toLowerCase() !== 'rvn' ? key : 'RVN';
          derivedBalance.satsConfirmed = (value as any)?.confirmed;
          derivedBalance.satsUnconfirmed = (value as any)?.unconfirmed;
          derivedBalance.derivedId = derivedID;
          await this.derivedBalanceRepository.save(derivedBalance);
        } else {
          isBalanceExist.satsConfirmed = (value as any)?.confirmed;
          isBalanceExist.satsUnconfirmed = (value as any)?.unconfirmed;
          await this.derivedBalanceRepository.save(isBalanceExist);
        }
      }
    }
    return;
  }

  async saveDerived(request) {
    try {
      await Promise.all(
        request.map(async (derivedElement) => {
          let derivedData = await this.getDerivedData({
            key: derivedElement.derivedData.pubkey
          });
          if (!derivedData) {
            derivedData = await this.addDerivedData(derivedElement.derivedData);
          }

          await this.saveDerivedBalance(
            derivedElement.balance,
            derivedElement.derivedData.scripthash,
            derivedData.id
          );
        })
      );

      return true;
    } catch (error) {
      console.error(`Error:- saveDerived :: ${error}`);
      return false;
    }
  }

  async balanceFromScriptHashes(scriptHashes: Array<string>) {
    const derivedData = await this.getAllDerivedData({
      scripthashes: scriptHashes
    });
    const balances = derivedData.map((derived) => derived.derivedBalance);
    const summedBalances = balances.flat().reduce((acc, balance) => {
      const { asset, satsConfirmed, satsUnconfirmed } = balance;
      if (!acc[asset]) {
        acc[asset] = { confirmed: 0, unconfirmed: 0 };
      }
      acc[asset].confirmed += parseInt(satsConfirmed.toString()) || 0;
      acc[asset].unconfirmed += parseInt(satsUnconfirmed.toString()) || 0;
      return acc;
    }, {});

    return { summedBalances, derivedData };
  }

  async updateBackgroundData({ walletIds, clientId }: { walletIds: number[]; clientId: string }) {
    const newWalletIds = [];
    for (const walletId of walletIds) {
      const derivedData = await this.getAllDerivedData({ walletIds });
      if (derivedData?.length > 0) {
        await this.webSocketClientService.backgroundRefreshBalances(derivedData, clientId);
      } else {
        console.log('No derived data found');
        newWalletIds.push(walletId);
      }
    }
    if (newWalletIds.length > 0) {
      const response: any = await this.pubsubService.requestFromMaster({
        type: 'walletDetails',
        request: {
          walletIds: newWalletIds
        }
      });
      if (response) {
        console.log('Response served', response.requestId);
        const walletData = response.data;
        if (!walletData.length) {
          console.log('No wallet data found');
          return;
        }
        await Promise.all(
          walletData.map(async (wallet) => {
            this.webSocketClientService.derivations(wallet);
          })
        );
      }
    }
  }
}
