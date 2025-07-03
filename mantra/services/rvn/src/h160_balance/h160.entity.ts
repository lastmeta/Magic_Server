import { Entity, Column, PrimaryGeneratedColumn, Index, ManyToOne, JoinColumn } from 'typeorm';

@Entity('h160')
export class H160 {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'bytea', unique: true })
  h160: Buffer;

  @Column({ type: 'int', nullable: true })
  walletId: number;

  @Column({ type: 'int', nullable: true })
  index: number;
}
