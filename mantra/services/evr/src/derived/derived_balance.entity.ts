import { Derived } from './derived.entity';
import { Entity, Column, PrimaryGeneratedColumn, OneToMany, JoinColumn, ManyToOne } from 'typeorm';

@Entity('derived_balance')
export class DerivedBalance {
  @PrimaryGeneratedColumn({ type: 'int' })
  id?: number;

  @Column({ type: 'int', nullable: false })
  derivedId: number; // derived id

  @Column({ type: 'varchar', nullable: true, default: 'EVR' })
  asset?: string;

  @Column({ type: 'bigint' })
  satsConfirmed: number;

  @Column({ type: 'bigint' })
  satsUnconfirmed: number;

  @ManyToOne(() => Derived, (derived) => derived.derivedBalance)
  @JoinColumn({ name: 'derivedId' })
  derived?: Derived;
}
