import { Entity, Column, PrimaryGeneratedColumn, OneToMany, JoinColumn, ManyToOne } from 'typeorm';
import { DerivedBalance } from './derived_balance.entity';

@Entity('children')
export class Derived {
  @PrimaryGeneratedColumn({ type: 'int' })
  id?: number;

  @Column({ type: 'int', nullable: false })
  walletId: number; // parent wallet id

  // @Column({ type: 'varchar', unique: true, nullable: false })
  @Column({ type: 'varchar', nullable: false })
  pubkey: string;

  @Column({ type: 'varchar', nullable: false })
  address: string;

  @Column({ type: 'varchar', nullable: true })
  scripthash: string;

  @Column({ type: 'int', nullable: true })
  exposure?: number;

  @Column({ type: 'int', nullable: true })
  index: number;

  @Column({ type: 'varchar', nullable: true })
  status?: string;

  @OneToMany(() => DerivedBalance, (derivedBalance) => derivedBalance.derived)
  derivedBalance?: DerivedBalance[];
}
