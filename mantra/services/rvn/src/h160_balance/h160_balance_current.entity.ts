import { Entity, Column, PrimaryGeneratedColumn, Index } from 'typeorm';

@Entity('address_balance_current')
export class AddressBalanceCurrent {
    @PrimaryGeneratedColumn()
    id: number;

    @Index()
    @Column({ type: 'int' })
    h160Id: number;
    @Index()
    @Column({ type: 'int', nullable: true })
    assetId: number;

    @Column({ type: 'bigint' })
    sats: BigInt;
    
    @Index()
    @Column({ type: 'int' })
    chainId: number;
}