import { Entity, Column, PrimaryGeneratedColumn, Index } from 'typeorm';

@Entity('vin')
export class BlockchainVIn {
  @PrimaryGeneratedColumn()
  id?: number;

  @Column({ type: 'bigint' })
  sequence?: number;

  @Column({ type: 'int' })
  vout?: number;

  @Column({ type: 'varchar' })
  tx_hash?: string;

  @Column({ type: 'varchar' })
  txid?: string;

  @Column({ type: 'varchar' })
  scriptSig_hex?: string;

  @Column({ type: 'varchar' })
  scriptSig_asm?: string;
}
