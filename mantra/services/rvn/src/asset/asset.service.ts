import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Asset } from './asset.entity';

@Injectable()
export class AssetService {
  constructor(
    @InjectRepository(Asset)
    private assetRepository: Repository<Asset>,
  ) {}

  async findAll(): Promise<Asset[]> {
    return await this.assetRepository.find(); 
  }

  async create(assetData: Asset): Promise<Asset> {
    return await this.assetRepository.save(assetData);
  }

  async reissue(): Promise<Boolean> {
    return true;
  }
  async freezeRestricted(): Promise<Boolean> {
    return true;
  }
  async tagAddress(): Promise<Boolean> {
    return true;
  }

  async getAssetMetadata(): Promise<Asset[]> {
    return await this.assetRepository.find();
  }
}