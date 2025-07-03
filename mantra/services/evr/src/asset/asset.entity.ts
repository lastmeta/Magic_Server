import { Entity, PrimaryGeneratedColumn, Column, Index, OneToMany, JoinColumn } from 'typeorm';
import { AssetMetadata } from './asset_metadata.entity';

@Entity("asset")
@Index(['symbol', 'chainId'], { unique: true }) 
export class Asset {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  chainId: number;

  @Column()
  symbol: string; 

  @Column()
  latestMetadataId: number;
  // asset_metadata id of highest height of asset_metadata_history table

  @OneToMany(() => AssetMetadata, metadata => metadata)
  @JoinColumn({ name: "latestMetadataId", referencedColumnName: "id" })
  metadata: AssetMetadata;
}