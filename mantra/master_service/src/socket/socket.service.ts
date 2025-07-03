import { forwardRef, Inject, Injectable } from '@nestjs/common';
// import { Socket } from 'socket.io';
import { WebSocket, Server } from 'ws';
import { ElectrumXService } from './socket-client.serve';
@Injectable()
export class SocketService {
  constructor(
    @Inject(forwardRef(() => ElectrumXService))
    private readonly electrumXService: ElectrumXService
  ) {}
  private readonly connectedClients: Map<string, WebSocket> = new Map();
  private rooms: Map<string, Set<WebSocket>> = new Map();
  wss: Server;

  public initializeServer() {
    this.wss = new WebSocket.Server({ noServer: true });

    // Handle new WebSocket connection
    this.wss.on('connection', (socket: WebSocket) => this.handleConnection(socket));
  }
  handleConnection(socket: WebSocket): void {
    global.socket = socket;

    const clientId = this.generateClientId();
    this.connectedClients.set(clientId, socket);

    socket.send(JSON.stringify({ event: 'connected', data: { clientId } }));

    socket.on('message', (message: string) => this.handleMessage(socket, message));
    socket.on('close', () => this.handleDisconnect(clientId));
    socket.on('error', (error) => this.handleError(clientId, error));
  }

  private handleMessage(socket: WebSocket, message: string): void {
    const parsedMessage = JSON.parse(message);

    switch (parsedMessage.event) {
      case 'joinRoom':
        this.handleJoinRoom(socket, parsedMessage.data.clientId);
        break;
      case 'leaveRoom':
        this.handleLeaveRoom(socket, parsedMessage.data.clientId);
        break;
      case 'disconnect':
        this.handleDisconnect(parsedMessage.data.clientId);
        break;
    }
  }

  private handleJoinRoom(socket: WebSocket, clientId: string): void {
    if (!this.rooms.has(clientId)) {
      this.rooms.set(clientId, new Set<WebSocket>());
    }

    const roomSockets = this.rooms.get(clientId);
    if (!roomSockets) {
      roomSockets.add(socket);
    }
    if (!global.socketConnected) {
      global.socketConnected = [
        {
          clientId: clientId
        }
      ];
    } else {
      const alreadySocketConnected = global.socketConnected.find(
        (elem) => elem.clientId === clientId
      );
      if (!alreadySocketConnected) {
        global.socketConnected.push({
          clientId: clientId
        });
      }
    }
    this.sendMessageToRoom(clientId, 'joinedRoom', {});
    // socket.send(JSON.stringify({ event: 'joinedRoom' }));
  }

  private handleLeaveRoom(socket: WebSocket, clientId: string): void {
    const roomSockets = this.rooms.get(clientId);
    if (roomSockets) {
      roomSockets.delete(socket);
      socket.send(JSON.stringify({ event: 'leftRoom' }));
    }
  }

  private handleDisconnect(clientId: string): void {
    console.log('Disconnected:', clientId);

    const connectedSocket = global.socketConnected?.find((elem) => elem.socketId === clientId);
    if (connectedSocket) {
      this.electrumXService.unSubscribe(connectedSocket.scriptHashes);
      global.socketConnected = global.socketConnected?.filter((elem) => elem.socketId !== clientId);
    }
    this.connectedClients.delete(clientId);

    // Remove client from rooms
    this.rooms.forEach((roomSockets, room) => {
      roomSockets.delete(this.connectedClients.get(clientId));
    });

    this.connectedClients.delete(clientId);
  }

  private handleError(clientId: string, error: any): void {
    console.log('Error:', clientId, error);
  }

  generateClientId(): string {
    return Math.random().toString(36).substring(2, 15);
  }

  sendMessageToRoom(room: string, event: string, data: any): void {
    const roomSockets = this.rooms.get(room);
    if (roomSockets) {
      roomSockets.forEach((socket) => {
        socket.send(JSON.stringify({ event, data }));
      });
    }
  }

}
