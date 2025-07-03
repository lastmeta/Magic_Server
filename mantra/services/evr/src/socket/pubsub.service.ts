import { createClient } from 'redis';
import { CHANNELS, REDIS_CONFIG } from '../utils/common';
import { Injectable } from '@nestjs/common';
import { DerivedService } from '../derived/derived.service';
import { TransactionService } from '../transactions/transaction.service';
// import { UserService } from '../user/user.service';

@Injectable()
export class AssetService {
  private publisher;
  private subscriber;
  private serviceConfig;
  private readonly HEARTBEAT_INTERVAL = 15000;

  constructor(
    serviceConfig,
    private derivedService?: DerivedService,
    private transactinoService?: TransactionService
    // private userService?: UserService
  ) {
    console.log(`AssetService instance created with config: ${JSON.stringify(serviceConfig)}`);
    this.serviceConfig = serviceConfig;
    // this.initialize();
  }
  async onModuleInit() {
    await this.initialize();
    this.startHeartbeat();
  }
  async onModuleDestroy() {
    await this.subscriber.unsubscribe(`asset-response-${this.serviceConfig.id}`);
  }

  private async initialize() {
    // Connect to Redis
    this.publisher = createClient(REDIS_CONFIG);
    this.subscriber = createClient(REDIS_CONFIG);

    await Promise.all([this.publisher.connect(), this.subscriber.connect()]);

    // Register this service to Redis
    await this.registerService();

    // Listen for queries
    const queryChannel = CHANNELS.getAssetQueryChannel(this.serviceConfig.id);
    await this.subscriber.subscribe(queryChannel, this.handleQuery.bind(this));
    // await this.subscriber.subscribe(
    //   `asset-response-${this.serviceConfig.id}`,
    //   this.handleMasterResponse.bind(this)
    // );
  }

  private async registerService() {
    // Publish service details to registry channel
    await this.publisher.publish(
      CHANNELS.ASSET_SERVICE_REGISTRY,
      JSON.stringify({
        id: this.serviceConfig.id,
        name: this.serviceConfig.name,
        type: this.serviceConfig.type,
        timestamp: Date.now()
      })
    );
  }

  private startHeartbeat() {
    setInterval(() => {
      const message = JSON.stringify({
        assetId: this.serviceConfig.id, // Assume this is set somewhere in your service
        timestamp: Date.now()
      });

      this.publisher.publish('asset-heartbeats', message);
    }, this.HEARTBEAT_INTERVAL);
  }

  private async handleQuery(message: string) {
    try {
      console.log('PUBSUB :: message', message);
      const query = JSON.parse(message);

      // Respond on the response channel specific to the query
      const responseChannel = CHANNELS.getAssetResponseChannel(query.serviceId);
      console.log('PUBSUB :: responseChannel', responseChannel);

      // Process the query and generate response
      const response = {
        serviceId: this.serviceConfig.id,
        requestId: query.requestId,
        timestamp: Date.now(),
        data: await this.processQuery(query.query)
      };

      // console.log('PUBSUB :: response', response);

      // Publish response
      await this.publisher.publish(responseChannel, JSON.stringify(response));
    } catch (error) {
      console.error('Error handling query:', error);
    }
  }

  async requestFromMaster(query: any) {
    const requestId = Date.now(); // or use a more robust ID generation
    const requestMessage = {
      requestId,
      serviceId: this.serviceConfig.id,
      query
    };

    // Publish the request to the MasterService
    await this.publisher.publish('asset-service-requests', JSON.stringify(requestMessage));
    return new Promise((resolve, reject) => {
      const responseHandler = (message: string) => {
        try {
          const response = JSON.parse(message);
          // Clean up the listener after receiving the response
          this.subscriber.unsubscribe(`asset-response-${this.serviceConfig.id}`);
          resolve(response);
        } catch (error) {
          reject(error);
        }
      };

      // Subscribe to the response channel
      this.subscriber.subscribe(`asset-response-${this.serviceConfig.id}`, responseHandler);
    });
  }

  private async handleMasterResponse(message: string) {
    try {
      const response = JSON.parse(message);
      // Handle the response (e.g., store it, log it, etc.)
      console.log('Received response from MasterService:', response);
    } catch (error) {
      console.error('Error handling MasterService response:', error);
    }
  }

  async processQuery(query: any) {
    try {
      console.log(query);
      switch (query.type) {
        case 'getDerivations':
          return await this.retryOperation(() =>
            this.derivedService.getAllDerivedData(query.request)
          );
        case 'updateBackgroundData':
          await this.retryOperation(() => this.derivedService.updateBackgroundData(query.request));
          return 'Request Received';
        case 'saveDerivedChildren':
          return await this.retryOperation(() => this.derivedService.saveDerived(query.request));
        case 'getTransactionHistory':
          return await this.retryOperation(() =>
            this.transactinoService.getTransactionHistories(query.request)
          );
        case 'getAllUTXOs':
          return await this.retryOperation(() =>
            this.transactinoService.getAllUTXOs(query.request.derivedIds)
          );
        case 'createTransaction':
          return await this.retryOperation(() =>
            this.transactinoService.createTransaction(query.request)
          );
        case 'broadcastTransaction':
          return await this.retryOperation(() =>
            this.transactinoService.broadcastTransaction(query.request.rawTx)
          );
      }
    } catch (error: any) {
      console.log(`Error:- parsing PUBSUB Query :- ${error}`);
      return {
        error: error.message
      };
    }
  }

  private async retryOperation(
    operation: () => Promise<any>,
    maxRetries = 5,
    initialDelay = 1000
  ): Promise<any> {
    let lastError;
    let delay = initialDelay;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;

        // Check if it's a connection error that we should retry
        if (
          error.code === '57P01' ||
          error.message?.includes('terminating connection') ||
          error.message?.includes('connection terminated')
        ) {
          console.log(
            `Database operation failed (attempt ${attempt}/${maxRetries}): ${error.message}`
          );

          // Wait before retrying with exponential backoff
          await new Promise((resolve) => setTimeout(resolve, delay));
          delay *= 1.5; // Exponential backoff
          continue;
        }

        // If it's not a connection error, rethrow
        throw error;
      }
    }

    // If we've exhausted all retries
    console.error(`Operation failed after ${maxRetries} attempts:`, lastError);
    throw lastError;
  }
}
