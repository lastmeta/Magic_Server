import { Body, Controller, Get, Headers, Post, Query } from '@nestjs/common';
import { UserService } from './user.service';
import { ElectrumXService } from '../socket/socket-client.serve';

@Controller('users')
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly webSocketClientService: ElectrumXService
  ) {}

  @Get()
  async findAll() {
    return await this.userService.findAll();
  }

  @Get('/socket')
  async connectSocket(@Query('socket') socket: string) {
    console.log('socket', socket);
    const [host, port] = socket.split(':');
    return await this.webSocketClientService.elecrumClientConnect(host, port);
  }

  @Get('/socket/subscribe')
  async subscribeSocket() {
    return await this.webSocketClientService.request('server.version', ['Satori Neuron', '1.10']);
  }

  @Post('/refresh')
  async refreshBalance(
    @Body('clientId') clientId: string,
    @Body('xpubkeys') xpubkeys?: Array<string>,
    @Body('scriptHashes') scriptHashes?: Array<string>,
    @Headers('deviceId') deviceId?: string
  ) {
    const response = await this.userService.refreshBalances({
      clientId,
      pubkeys: xpubkeys,
      scriptHashes,
      deviceId
    });

    return {
      status: 200,
      message: 'User balance fetched',
      data: response
    };
  }

  @Get('test')
  async test() {
    return await this.userService.test();
  }
}
