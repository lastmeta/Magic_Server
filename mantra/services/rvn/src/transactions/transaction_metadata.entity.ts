import { Entity, Column, PrimaryGeneratedColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BlockchainTransaction } from './transaction.entity';

@Entity('transaction_metadata')
export class TransactionMetadata {
  @PrimaryGeneratedColumn()
  id?: number;

  @Column({ type: 'varchar' })
  tx_hash: string;

  @Column({ type: 'int' })
  txId?: number;

  @Column({ type: 'varchar' })
  address: string;

  @Column({ type: 'varchar' })
  asset: string;

  @Column({ type: 'numeric', precision: 20, scale: 8, nullable: true })
  sent?: number;

  @Column({ type: 'numeric', precision: 20, scale: 8, nullable: true })
  receive?: number;

  @Column({ type: 'boolean', default: false })
  sameWallet?: boolean;

  @ManyToOne(() => BlockchainTransaction, (transaction) => transaction.metadata)
  @JoinColumn({ name: 'txId' })
  transaction?: BlockchainTransaction;
}
