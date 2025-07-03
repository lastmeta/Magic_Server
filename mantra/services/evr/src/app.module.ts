import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import dbConfiguration from '../typeorm.config';
import { SocketModule } from './socket/socket.module';
import { AssetModule } from './asset/asset.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    TypeOrmModule.forRoot(dbConfiguration),
    SocketModule,
    AssetModule,
  ],
  controllers: [AppController],
  providers: [AppService]
})
export class AppModule {
  configure(consumer: any) {
    consumer.apply().forRoutes('*');
  }
}
