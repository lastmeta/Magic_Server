import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThan, Repository } from 'typeorm';
import { ElectrumXNodeEntity } from './node.entity';

@Injectable()
export class NodeService {
  constructor(
    @InjectRepository(ElectrumXNodeEntity)
    private nodeRepository: Repository<ElectrumXNodeEntity>
  ) {}

  async addNodes({
    chain,
    ip,
    port,
    donation_address
  }: {
    chain: string;
    ip: string;
    port: string;
    donation_address: string;
  }) {
    const nodeExist = await this.nodeRepository.findOne({
      where: {
        chain,
        ip
      }
    });
    if (nodeExist) {
      const updateObject: ElectrumXNodeEntity = {
        last_seen: new Date()
      };
      if (port !== nodeExist.port) {
        updateObject.port = port;
      }
      if (donation_address !== nodeExist.donation_address) {
        updateObject.donation_address = donation_address;
      }

      await this.nodeRepository.update(
        {
          id: nodeExist.id
        },
        updateObject
      );
    } else {
      const newNode = new ElectrumXNodeEntity();
      newNode.chain = chain;
      newNode.ip = ip;
      newNode.port = port;
      newNode.donation_address = donation_address;
      newNode.last_seen = new Date();

      await this.nodeRepository.save(newNode);
    }
  }

  async getRecentNodes({ chain, skip, limit }: { chain: string; skip?: number; limit?: number }) {
    const dateThreshold = new Date();
    dateThreshold.setHours(dateThreshold.getHours() - 48);

    console.log('check', dateThreshold);
    const condition: any = {
      last_seen: MoreThan(dateThreshold)
    };
    if (chain) {
      condition.chain = chain;
    }
    const query: any = {
      where: condition
    };
    if (skip && limit) {
      query.skip = skip;
      query.limit = limit;
    }
    const [nodes, total] = await this.nodeRepository.findAndCount(query);

    return {
      total,
      data: nodes
    };
  }
}
