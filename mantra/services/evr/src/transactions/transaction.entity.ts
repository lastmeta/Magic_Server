import { Entity, Column, PrimaryGeneratedColumn, Index, OneToMany } from 'typeorm';
import { TransactionMetadata } from './transaction_metadata.entity';

@Entity('blockchain_transaction')
export class BlockchainTransaction {
  @PrimaryGeneratedColumn()
  id?: number;

  @Column({ type: 'varchar', unique: true })
  @Index()
  hash: string;

  @Column({ type: 'int' })
  @Index()
  height: number;

  @Column({ type: 'int' })
  vsize: number;

  @Column({ type: 'numeric', precision: 20, scale: 8, nullable: true })
  fee?: number;

  @Column({ type: 'timestamp' })
  blockTime: Date;

  @Column({ type: 'timestamp' })
  lockTime: Date;

  // @Column({ type: 'int' })
  // chainId: number;

  // @Column({ type: 'int', nullable: true })
  // opReturnId: number;

  @OneToMany(() => TransactionMetadata, (metadata) => metadata.transaction)
  metadata?: TransactionMetadata[];
}
