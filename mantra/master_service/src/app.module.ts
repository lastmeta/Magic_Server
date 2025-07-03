import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import dbConfiguration from '../typeorm.config';
import { UserModule } from './user/user.module';
import { SocketModule } from './socket/socket.module';
import { AssetModule } from './asset/asset.module';
import { TransactionModule } from './transactions/transaction.module';
import { ElectrumXNodeModule } from './electrumxNode/node.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    TypeOrmModule.forRoot(dbConfiguration),
    UserModule,
    SocketModule,
    AssetModule,
    TransactionModule,
    ElectrumXNodeModule
  ],
  controllers: [AppController],
  providers: [AppService]
})
export class AppModule {
  configure(consumer: any) {
    consumer.apply().forRoutes('*');
  }
}
