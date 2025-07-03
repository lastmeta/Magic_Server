import { Entity, Column, PrimaryGeneratedColumn, Index, JoinColumn, ManyToOne } from 'typeorm';
import { Asset } from '../asset/asset.entity';
@Entity('transaction_asset_link')
export class TransactionAssetLink {
    @PrimaryGeneratedColumn()
    transactionId: number;

    @Column({ type: 'int' })
    @Index()
    assetId: number;

    @ManyToOne(() => Asset, {
      nullable: true,
      createForeignKeyConstraints: false,
    })
    @JoinColumn({ name: "assetId", referencedColumnName: "id" })
    owner: Asset;
}
