import { Entity, Column, PrimaryGeneratedColumn, Index, OneToMany } from 'typeorm';

@Entity('wallet')
export class Wallet {
  @PrimaryGeneratedColumn()
  id?: number;

  @Column({ type: 'varchar', unique: true })
  publicKey: string;

  @Column({ type: 'varchar', unique: true })
  address: string;

  @Column({ type: 'varchar', unique: true })
  scriptHash: string;
  
  @Column('simple-array', { nullable: true })
  deviceIds?: string[];

  // @OneToMany(() => Derived, (derived) => derived.wallet)
  // derived?: Derived[];
}
