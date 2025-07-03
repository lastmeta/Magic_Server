import { Repository } from 'typeorm';
import { Injectable } from '@nestjs/common';
import { Derived } from './derived.entity';
import { DerivedBalance } from './derived_balance.entity';

@Injectable()
export class DerivedRepository extends Repository<Derived> {}

@Injectable()
export class DerivedBalanceRepository extends Repository<DerivedBalance> {}
