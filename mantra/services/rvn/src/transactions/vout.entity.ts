import { Entity, Column, PrimaryGeneratedColumn, Index } from 'typeorm';

@Entity('vout')
export class BlockchainVOut {
  @PrimaryGeneratedColumn()
  id?: number;

  @Column({ type: 'int' })
  node?: number;

  @Column({ type: 'numeric', precision: 28, scale: 9, nullable: true })
  value?: number;

  @Column({ type: 'varchar', nullable: true })
  asset?: string;

  @Column({ type: 'varchar' })
  tx_hash?: string;

  @Column({ type: 'varchar' })
  scriptPubKey_asm?: string;

  @Column({ type: 'varchar' })
  scriptPubKey_hex?: string;

  @Column({ type: 'bigint' })
  scriptPubKey_reqSigs?: number;

  @Column({ type: 'varchar' })
  scriptPubKey_type?: string;

  @Column({ type: 'simple-array' })
  scriptPubKey_addresses?: string[];
}
