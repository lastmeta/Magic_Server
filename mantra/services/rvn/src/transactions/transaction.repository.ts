import { Repository } from 'typeorm';
import { BlockchainTransaction } from './transaction.entity';
import { Injectable } from '@nestjs/common';
import { BlockchainUnSpent } from './unspent.entity';
import { BlockchainVOut } from './vout.entity';
import { BlockchainVIn } from './vin.entity';
import { TransactionMetadata } from './transaction_metadata.entity';

@Injectable()
export class TransactionRepository extends Repository<BlockchainTransaction> {}

@Injectable()
export class TransactionMetadataRepository extends Repository<TransactionMetadata> {}

@Injectable()
export class UnSpentRepository extends Repository<BlockchainUnSpent> {}

@Injectable()
export class VOutRepository extends Repository<BlockchainVOut> {}

@Injectable()
export class VInRepository extends Repository<BlockchainVIn> {}
