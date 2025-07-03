import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Derived } from './derived.entity';
import { DerivedBalanceRepository, DerivedRepository } from './derived.repository';
import { DerivedService } from './derived.service';
import { DerivedBalance } from './derived_balance.entity';
import { ElectrumXService } from '../socket/socket-client.serve';
import { TransactionModule } from '../transactions/transaction.module';
import { SocketModule } from '../socket/socket.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Derived, DerivedBalance]),
    forwardRef(() => TransactionModule),
    forwardRef(() => SocketModule)
  ],
  providers: [DerivedService, DerivedRepository, DerivedBalanceRepository, ElectrumXService],
  controllers: [],
  exports: [DerivedService]
})
export class DerivedModule {}
