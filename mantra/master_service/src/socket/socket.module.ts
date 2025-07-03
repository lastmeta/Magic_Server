import { forwardRef, Module } from '@nestjs/common';
import { SocketGateway } from './socket.gateway';
import { SocketService } from './socket.service';
import { WalletModule } from '../wallet/wallet.module';
import { ElectrumXService } from './socket-client.serve';
import { UserModule } from '../user/user.module';
import { MasterService } from './pubsub.service';
import { WalletService } from '../wallet/wallet.service';

@Module({
  imports: [forwardRef(() => WalletModule), forwardRef(() => UserModule)],
  providers: [SocketGateway, SocketService, ElectrumXService, MasterService],
  exports: [SocketService, ElectrumXService, MasterService]
})
export class SocketModule {}
