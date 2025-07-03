import { Entity, Column, PrimaryGeneratedColumn, Index, OneToOne, JoinColumn, OneToMany } from 'typeorm';
import { Wallet } from './wallet.entity';
import { Asset } from 'src/asset/asset.entity';

// @Entity('wallet_balance_current')
export class WalletBalanceCurrent {
    @PrimaryGeneratedColumn()
    id: number;

    @Index()
    @Column({ type: 'int' })
    walletId: number;

    @Index()
    @Column({ type: 'int', nullable: true })
    assetId: number;

    @Column({ type: 'bigint' })
    sats: BigInt;

    @Index()
    @Column({ type: 'int' })
    chainId: number;

    @OneToOne(() => Wallet, { nullable: true })
    @JoinColumn({ name: "walletId", referencedColumnName: "id" })
    metadata: Wallet;

    @OneToMany(() => Asset, asset => asset)
    @JoinColumn({ name: "assetId", referencedColumnName: "id" })
    asset: Asset;

    //TODO : Add Constrain for chainId
}