import { Entity, Column, PrimaryGeneratedColumn, Index } from 'typeorm';

@Entity('unspent')
export class BlockchainUnSpent {
  @PrimaryGeneratedColumn()
  id?: number;

  @Column({ type: 'varchar', nullable: true, default: 'unspent' })
  status?: string;

  @Column({ type: 'varchar', nullable: false })
  tx_hash?: string;

  @Column({ type: 'int', nullable: false })
  tx_pos?: number;

  @Column({ type: 'varchar', nullable: true })
  asset?: string;

  @Column({ type: 'int' })
  value?: number;

  @Column({ type: 'int' })
  height?: number;

  @Column({ type: 'int', nullable: true })
  walletId?: number;

  @Column({ type: 'int', nullable: true })
  derivedId?: number;
}
