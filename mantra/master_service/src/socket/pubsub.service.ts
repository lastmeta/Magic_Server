import { createClient } from 'redis';
import { generateRandomNumberString, REDIS_CONFIG } from '../utils/common';
import { ElectrumXService } from './socket-client.serve';
import { SocketService } from './socket.service';
import { WalletService } from '../wallet/wallet.service';
import { forwardRef, Inject } from '@nestjs/common';

export class MasterService {
  private publisher;
  private subscriber;
  private pendingRequests: Map<
    string,
    {
      resolve: (value: any) => void;
      reject: (reason?: any) => void;
      timeout: NodeJS.Timeout;
    }
  >;
  private assetServices: Map<string, any>;
  private readonly REQUEST_TIMEOUT = 30000; // 30 seconds
  private readonly HEARTBEAT_INTERVAL = 30000; // 30 seconds
  private readonly TIMEOUT_THRESHOLD = 60000; // 1 minute
  private assetHeartbeats = new Map<string, number>();

  constructor(
    private webSocketClientService: ElectrumXService,
    private socketService: SocketService,
    @Inject(forwardRef(() => WalletService))
    private walletService: WalletService
  ) {
    this.pendingRequests = new Map();
    this.assetServices = new Map();
    // this.initialize();
  }
  async onModuleInit() {
    await this.initialize();

    // Fetch registered Asset services from Redis
    const registeredAssets = await this.publisher.sMembers('registered-asset-services');
    console.log('registered assets:', registeredAssets);

    for (const assetId of registeredAssets) {
      console.log(`Re-registering Asset service: ${assetId}`);
      await this.registerAssetService({ id: assetId });
    }

    // Start heartbeat monitoring
    this.startHeartbeatMonitor();
    this.subscribeToHeartbeats();
  }

  // Implement OnModuleDestroy
  async onModuleDestroy() {
    await this.shutdown();
  }

  private async initialize() {
    // Create Redis clients
    this.publisher = createClient(REDIS_CONFIG);
    this.subscriber = createClient(REDIS_CONFIG);

    // Error handling
    this.publisher.on('error', (err) => console.error('Publisher Error:', err));
    this.subscriber.on('error', (err) => console.error('Subscriber Error:', err));

    // Connect both clients
    await Promise.all([this.publisher.connect(), this.subscriber.connect()]);

    // Subscribe to asset service registrations
    await this.subscriber.subscribe('asset-service-registry', (message) => {
      const service: any = JSON.parse(message);
      this.registerAssetService(service);
    });
    global.connectedServices = [];
  }

  private async registerAssetService(service: any) {
    if (this.assetServices.has(service.id)) {
      console.log(`Service ${service.name} (${service.id}) is already registered.`);
      return; // Exit if already registered
    }
    this.assetServices.set(service.id, service);

    // Subscribe to responses from this service
    const responseChannel = `asset-response-${service.id}`;
    if (!this.subscriber.listenerCount(responseChannel)) {
      await this.subscriber.subscribe(responseChannel, (message) => {
        this.handleResponse(message);
      });
      console.log(`Subscribed to ${responseChannel}`);
    }

    console.log(`Registered asset service: ${service.name} (${service.id})`);
    if (global?.connectedServices?.length === 0) {
      console.log('No connected services found. Starting asset service discovery.');
      global.connectedServices = [service.id];
    } else {
      console.log('Asset service discovery already in progress.', global.connectedServices);
      global.connectedServices?.push(service.id);
    }
    await this.subscriber.subscribe(
      'asset-service-requests',
      this.handleAssetServiceRequest.bind(this)
    );
    // Store Asset service in Redis
    await this.publisher.sAdd('registered-asset-services', service.id);
  }

  // Subscribe to heartbeat messages from asset services
  private subscribeToHeartbeats() {
    this.subscriber.subscribe('asset-heartbeats', (message) => {
      const { assetId, timestamp } = JSON.parse(message);
      this.assetHeartbeats.set(assetId, timestamp);
    });
  }

  // Periodically check health of registered services
  private startHeartbeatMonitor() {
    setInterval(async () => {
      const now = Date.now();
      const registeredAssets = await this.publisher.sMembers('registered-asset-services');

      for (const assetId of registeredAssets) {
        const lastHeartbeat = this.assetHeartbeats.get(assetId) || 0;

        if (now - lastHeartbeat > this.TIMEOUT_THRESHOLD) {
          console.log(`Asset service ${assetId} timed out. Removing from registry.`);
          await this.unregisterAssetService(assetId);
        }
      }
    }, this.HEARTBEAT_INTERVAL);
  }

  private async unregisterAssetService(assetId: string) {
    await this.publisher.sRem('registered-asset-services', assetId);
    this.assetHeartbeats.delete(assetId);
  }

  private handleResponse(message: string) {
    try {
      const response: any = JSON.parse(message);
      const request = this.pendingRequests.get(response.requestId);

      if (request) {
        clearTimeout(request.timeout);
        this.pendingRequests.delete(response.requestId);

        if (response.error) {
          request.reject(new Error(response.error));
        } else {
          request.resolve(response.data);
        }
      }
    } catch (error) {
      console.error('Error handling response:', error);
    }
  }

  private async handleAssetServiceRequest(message: string) {
    try {
      const request: any = JSON.parse(message);
      // Process the request and generate a response
      const response = {
        requestId: request.requestId,
        data: await this.processRequest(request.query) // Implement this method to handle the request
      };
      // Publish the response back to the AssetService
      this.publisher.publish(`asset-response-${request.serviceId}`, JSON.stringify(response));
    } catch (error) {
      console.error('Error handling asset service request:', error);
    }
  }

  async queryAssetService(serviceId: string, query: any): Promise<any> {
    console.log('queryAssetService', serviceId, JSON.stringify(query));
    if (!this.assetServices.has(serviceId)) {
      throw new Error(`Asset service with ID ${serviceId} not found`);
    }

    return new Promise((resolve, reject) => {
      //   const requestId = uuidv4();
      const requestId = generateRandomNumberString();
      const request: any = {
        requestId,
        serviceId,
        query,
        timestamp: Date.now()
      };
      console.log('PUBSUB :: request', request);
      // Set up timeout
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        // reject(new Error('Request timed out'));
      }, this.REQUEST_TIMEOUT);
      // console.log('PUBSUB :: pendingRequest', this.pendingRequests);
      // Store the promise handlers
      this.pendingRequests.set(requestId, {
        resolve,
        reject,
        timeout: timeout as unknown as NodeJS.Timeout
      });

      // console.log('PUBSUB :: pendingRequest', this.pendingRequests);
      // Publish the request
      this.publisher.publish(`asset-query-${serviceId}`, JSON.stringify(request));
    });
  }

  async shutdown() {
    await this.publisher.quit();
    await this.subscriber.quit();
  }

  async processRequest(query: any): Promise<any> {
    console.log('processRequest', query);
    switch (query.type) {
      case 'transactionDetails':
        return this.webSocketClientService.getTransactionDetails({
          tx_hex: query.request.tx_hex
        });
        break;
      case 'walletDetails':
        if (query.request.id) {
          return this.walletService.getWalletData({ id: query.request.id });
        } else if (query.request.walletIds) {
          const wallets = await this.walletService.getAllWallets({
            walletIds: query.request.walletIds
          });
          return wallets;
        }
        break;
      case 'balance_update':
        this.socketService.sendMessageToRoom(query.request.clientId, 'balance_update', {
          balance: query.request.balance
        });
        break;
    }
  }
}
