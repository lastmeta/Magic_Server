import { Controller, Get, Post } from '@nestjs/common';
import { AssetService } from './asset.service';

@Controller('assets')
export class AssetController {
  constructor(private readonly assetService: AssetService) {}

  @Get()
  async findAll() {
    console.log('findAll  called');
    return await this.assetService.findAll();
  }

  @Post()
  async createAsset() {
    console.log('create  called');
    return await this.assetService.create({
      chainId: 1,
      id: 1,
      metadata: {
        associatedData: Buffer.from([]),
        divisibility: 0,
        frozen: false,
        id: 1,
        reissuable: false,
        totalSupply: 0,
        verifierStringVoutId: 0,
        voutId: 0
      },
      latestMetadataId: 0,
      symbol: 'symbol'
    });
  }

  @Post()
  async reissueAsset(){
    console.log('reissue  called');
    return await this.assetService.reissue();
  }
  @Post()
  async freezeRestrictedAsset(){
    console.log('reissue  called');
    return await this.assetService.freezeRestricted();
  }
  @Post()
  async tagAddress(){
    console.log('reissue  called');
    return await this.assetService.tagAddress();
  }


  @Get("/metadata")
  async getAssetMetadata( ){
    console.log('getAssetMetadata  called');
    return await this.assetService.getAssetMetadata();
  }
}
