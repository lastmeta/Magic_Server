import { WebSocketGateway, OnGatewayConnection, WebSocketServer } from '@nestjs/websockets';
// import { Socket } from 'socket.io';
import { WebSocket } from 'ws';
import { SocketService } from './socket.service';

@WebSocketGateway()
export class SocketGateway implements OnGatewayConnection {
  @WebSocketServer()
  private server: WebSocket;

  constructor(private readonly socketService: SocketService) {}
  public onModuleInit() {
    this.socketService.initializeServer();
  }
  handleConnection(): void {
    this.socketService.initializeServer();
  }

  // Implement other Socket.IO event handlers and message handlers
}
