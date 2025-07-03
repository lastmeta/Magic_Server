import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('electrumx_nodes')
export class ElectrumXNodeEntity {
  @PrimaryGeneratedColumn()
  id?: number;

  @Column({ type: 'varchar', unique: false })
  chain?: string;

  @Column({ type: 'varchar', unique: false })
  ip?: string;

  @Column({ type: 'varchar', unique: false })
  port?: string;

  @Column({ type: 'varchar', unique: false })
  donation_address?: string;

  @Column({ type: 'timestamptz', unique: false })
  last_seen?: Date;
}
