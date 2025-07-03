import { Repository } from 'typeorm';
import { Injectable } from '@nestjs/common';
import { Wallet } from './wallet.entity';

@Injectable()
export class WalletRepository extends Repository<Wallet> {}
