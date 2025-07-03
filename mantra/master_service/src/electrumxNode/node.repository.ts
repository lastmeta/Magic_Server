import { Repository } from 'typeorm';
import { ElectrumXNodeEntity } from './node.entity';
import { Injectable } from '@nestjs/common';

@Injectable()
export class NodeRepository extends Repository<ElectrumXNodeEntity> {}
