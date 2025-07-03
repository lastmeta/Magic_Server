import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BlockchainTransaction } from './transaction.entity';
import { TransactionService } from './transaction.service';
import {
  TransactionMetadataRepository,
  TransactionRepository,
  UnSpentRepository,
  VInRepository,
  VOutRepository
} from './transaction.repository';
import { TransactionController } from './transaction.controller';
import { BlockchainUnSpent } from './unspent.entity';
import { BlockchainVOut } from './vout.entity';
import { BlockchainVIn } from './vin.entity';
import { DerivedModule } from '../derived/derived.module';
import { SocketModule } from '../socket/socket.module';
import { TransactionMetadata } from './transaction_metadata.entity';
@Module({
  imports: [
    TypeOrmModule.forFeature([
      BlockchainTransaction,
      TransactionMetadata,
      BlockchainUnSpent,
      BlockchainVOut,
      BlockchainVIn
    ]),
    forwardRef(() => DerivedModule),
    forwardRef(() => SocketModule)
  ],
  providers: [
    TransactionService,
    TransactionRepository,
    TransactionMetadataRepository,
    UnSpentRepository,
    VOutRepository,
    VInRepository
  ],
  controllers: [TransactionController],
  exports: [
    TransactionService,
    TransactionRepository,
    TransactionMetadataRepository,
    UnSpentRepository,
    VOutRepository,
    VInRepository
  ]
})
export class TransactionModule {}
