import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ElectrumXNodeEntity } from './node.entity';
import { NodeService } from './node.service';
import { NodeRepository } from './node.repository';
import { NodeController } from './node.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ElectrumXNodeEntity])],
  providers: [NodeService, NodeRepository],
  controllers: [NodeController],
  exports: [NodeService]
})
export class ElectrumXNodeModule {}
