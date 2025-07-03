import { Repository } from 'typeorm';
import { BlockchainBlock } from './block.entity';
import { Injectable } from '@nestjs/common';

@Injectable()
export class BlockRepository extends Repository<BlockchainBlock> {}
