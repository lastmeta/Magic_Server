import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransactionService } from './transaction.service';
import { TransactionController } from './transaction.controller';
import { WalletModule } from '../wallet/wallet.module';
import { SocketModule } from '../socket/socket.module';
@Module({
  imports: [
    forwardRef(() => WalletModule),
    forwardRef(() => SocketModule)
  ],
  providers: [
    TransactionService,
  ],
  controllers: [TransactionController],
  exports: [
    TransactionService,
  ]
})
export class TransactionModule {}
