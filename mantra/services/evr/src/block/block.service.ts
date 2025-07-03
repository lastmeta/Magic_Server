import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BlockchainBlock } from './block.entity';

@Injectable()
export class BlockService {
  constructor(
    @InjectRepository(BlockchainBlock)
    private userRepository: Repository<BlockchainBlock>
  ) {}

  async findAll(): Promise<BlockchainBlock[]> {
    return await this.userRepository.find();
  }
}
