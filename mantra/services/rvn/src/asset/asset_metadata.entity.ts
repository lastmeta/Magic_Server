import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('asset_metadata')
export class AssetMetadata {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'boolean', default: false })
    reissuable: boolean;

    @Column({ type: 'int' })
    totalSupply: number;

    @Column({ type: 'int' })
    divisibility: number;

    @Column({ type: 'bytea', nullable: true })
    associatedData: Buffer;

    @Column({ type: 'boolean', default: false })
    frozen: boolean;

    @Column({ type: 'int', nullable: true })
    verifierStringVoutId: number;

    @Column({ type: 'int' })
    voutId: number;
}