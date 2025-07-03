import { Entity, Column, PrimaryGeneratedColumn, Index } from 'typeorm';

@Entity('blockchain_block')
export class BlockchainBlock {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  chainId: number;

  @Index()
  @Column({ type: 'int' })
  height: number;

  @Index()
  @Column({ type: 'bytea' })
  hash: Buffer;

  @Column({ type: 'timestamp' })
  blocktime: Date;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  insertedAt: Date;
}
