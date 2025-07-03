import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Wallet } from './wallet.entity';

@Injectable()
export class WalletService {
  constructor(
    @InjectRepository(Wallet)
    private walletRepository: Repository<Wallet>
  ) {}

  async addWalletData(data: Wallet): Promise<Wallet> {
    if (data.id) {
      return this.walletRepository.save(data);
    }
    const derivedData = new Wallet();
    derivedData.address = data.address;
    derivedData.publicKey = data.publicKey;
    derivedData.scriptHash = data.scriptHash;

    return this.walletRepository.save(derivedData);
  }

  async getWalletData({ key, id }: { key?: string; id?: number }): Promise<Wallet> {
    let condition: any = {};
    if (key) {
      condition = [{ address: key }, { publicKey: key }];
    }
    if (id) {
      condition = { id };
    }
    return this.walletRepository.findOne({ where: condition });
  }

  async getAllWallets({
    pubkeys,
    deviceId,
    walletIds
  }: {
    pubkeys?: string[];
    deviceId?: string;
    walletIds?: number[];
  }): Promise<Wallet[]> {
    let condition: any = {};
    if (pubkeys?.length) {
      condition = { publicKey: In(pubkeys) };
    }
    if (deviceId) {
      condition = {
        deviceIds: {
          $contains: [deviceId]
        }
      };
    }
    if (walletIds?.length) {
      condition = { id: In(walletIds) };
    }
    return this.walletRepository.find({ where: condition });
  }

  async getAllWalletsWithBalances(): Promise<Wallet[]> {
    const wallets = await this.walletRepository.find({
      select: {
        publicKey: true
      }
    });
    return wallets;
  }
}
