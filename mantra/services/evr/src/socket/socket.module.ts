import { forwardRef, Module } from '@nestjs/common';
import { ElectrumXService } from './socket-client.serve';
import { DerivedModule } from '../derived/derived.module';
import { TransactionModule } from '../transactions/transaction.module';
import { AssetService } from './pubsub.service';
import { DerivedService } from '../derived/derived.service';
import { TransactionService } from '../transactions/transaction.service';

@Module({
  imports: [forwardRef(() => DerivedModule), forwardRef(() => TransactionModule)],
  providers: [
    ElectrumXService,
    {
      provide: AssetService,
      useFactory: (derivedService: DerivedService, transactionService: TransactionService) => {
        const serviceConfig = {
          id: process.env.SERVICE_ID || 'EVR',
          name: process.env.SERVICE_NAME || 'Asset Service',
          type: 'asset'
        };
        return new AssetService(serviceConfig, derivedService, transactionService);
      },
      inject: [DerivedService, TransactionService]
    }
  ],
  exports: [ElectrumXService, AssetService]
})
export class SocketModule {}
