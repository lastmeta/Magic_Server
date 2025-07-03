import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Asset } from './asset.entity';
import { AssetMetadata } from './asset_metadata.entity';
import { AssetService } from './asset.service';
import { AssetRepository } from './asset.repository';
import { AssetController } from './asset.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Asset]),TypeOrmModule.forFeature([AssetMetadata])],
  providers: [AssetService,AssetRepository],
  controllers: [AssetController],
})
export class AssetModule {}