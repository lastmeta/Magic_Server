import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BlockchainBlock } from './block.entity';
import { BlockService } from './block.service';
import { BlockRepository } from './block.repository';
import { BlockController } from './block.controller';

@Module({
  imports: [TypeOrmModule.forFeature([BlockchainBlock])],
  providers: [BlockService, BlockRepository],
  controllers: [BlockController]
})
export class BlockModule {}
