import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { Socket, io } from 'socket.io-client';
import {
  connections,
  decodeVOutAsm,
  getAddressFromScriptSig,
  getDerivedData,
  getElectrumConnectionString,
  getPrivateKeyFromMnemonic,
  makeRequest
} from '../utils/common';
import { ElectrumClient } from '@gemlinkofficial/electrum-client-ts';
import { WalletService } from '../wallet/wallet.service';
import { Wallet } from '../wallet/wallet.entity';
import { UserService } from '../user/user.service';
import { SocketService } from './socket.service';

@Injectable()
export class ElectrumXService {
  constructor(
    @Inject(forwardRef(() => WalletService))
    private readonly walletService: WalletService,
    @Inject(forwardRef(() => UserService))
    private readonly userService: UserService,
    @Inject(forwardRef(() => SocketService))
    private readonly socketService: SocketService
  ) {}
  private socket: Socket;
  private electrumClient: ElectrumClient;
  private subscribedScriptHashes: Set<string> = new Set();

  async connect(url: string) {
    await new Promise((resolve, reject) => {
      try {
        this.socket = io(url);
        this.socket.connect();

        resolve('connect');
      } catch (e) {
        console.log('Error connecting to WebSocket server.', e);
        reject(e);
      }
    });

    this.socket.on('connect', () => {
      console.log('Connected to WebSocket server');
    });

    this.socket.on('disconnect', () => {
      console.log('Disconnected from WebSocket server');
    });

    this.socket.on('message', (message) => {
      console.log('Received message:', message);
    });

    this.socket.on('connection_error', (error) => {
      console.log('WebSocket connection closed.', error);
    });
    this.socket.on('error', (error) => {
      console.log('WebSocket connection Error.', error);
    });

    console.log('WebSocket connection established.', this.socket);
  }
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      console.log('WebSocket connection closed.');
    }
  }

  async unSubscribe(scriptHashes: string[]) {
    await Promise.all(
      scriptHashes.map(async (scriptHash) => {
        this.subscribedScriptHashes.delete(scriptHash);
        const findConnection = global.connectionResult.findIndex((connection) =>
          connection.scriptHashes.includes(scriptHash)
        );
        if (findConnection !== -1) {
          const connectionData =
            global.connectionResult[findConnection].connectionString.split(':');
          await this.elecrumClientConnect(connectionData[0], connectionData[1]);

          this.electrumClient.blockchain_scripthash_unsubscribe(scriptHash);

          global.connectionResult[findConnection].scriptHashes = global.connectionResult[
            findConnection
          ].scriptHashes.filter((elem) => elem !== scriptHash);
          global.connectionResult[findConnection].count--;
        }
      })
    );
  }

  async elecrumClientConnect(host: string, port: string) {
    this.electrumClient = new ElectrumClient(host, port, 'ssl');
    await this.electrumClient.connect('Satori Neuron', '1.10');
    console.log('Connected to Electrum server:', host, port);
    const headers: any = await this.electrumClient.blockchain_headers_subscribe();
    console.log('headers', headers);

    // this.electrumClient.subscribe.on('blockchain.scripthash.subscribe', (scripthash, status) => {
    //   this.handleSubscribeMessage(scripthash, status);
    //   // Handle status updates here
    // });
    // this.electrumClient.subscribe.on('blockchain.headers.subscribe', (message) => {
    //   console.log('blockchain.headers.subscribe', message);
    // });
  }

  sendMessage(message: any) {
    this.socket.emit('message', message);
  }

  request(method: string, params: any): Promise<any> {
    if (!this.socket.connected) {
      console.log('WebSocket connection is not established.');
      // return Promise.reject(new Error('WebSocket connection is not established.'));
    }
    return new Promise<any>((resolve, reject) => {
      const content = makeRequest(method, params, '');

      this.socket.send(content + '\n', 'utf8');
    });
  }

  async getOnlyBalance({ scripthash }: { scripthash: string }) {
    if (!this.electrumClient) {
      await this.elecrumClientConnect('146.190.38.120', '50002');
    }
    // const balance = await this.electrumClient.blockchain_scripthash_getBalance(publicScriptHash);
    // console.log('balance', balance);
    const allBalance = await this.electrumClient.request('blockchain.scripthash.get_balance', {
      scripthash: scripthash,
      asset: true
    });
    return allBalance;
  }

  async getUnspentTransactions({ scripthash }: { scripthash: string }) {
    if (!this.electrumClient) {
      await this.elecrumClientConnect('146.190.38.120', '50002');
    }
    // const unspents = await this.electrumClient.blockchain_scripthash_getHistory(scripthash);
    const unspents = await this.electrumClient.request('blockchain.scripthash.listunspent', {
      scripthash,
      asset: true
    });

    return unspents;
  }

  async getTransactionDetails({ tx_hex, verbose = true }: { tx_hex: string; verbose?: boolean }) {
    if (!this.electrumClient) {
      await this.elecrumClientConnect('146.190.38.120', '50002');
    }
    const transaction = await this.electrumClient.blockchain_transaction_get(tx_hex, verbose);
    if (!transaction) {
      setTimeout(() => {
        return this.getTransactionDetails({ tx_hex });
      }, 5000);
    }
    return transaction;
  }

  async subscribeToScripthash(scripthashes: string[]) {
    // if (!this.electrumClient) {
    //   await this.elecrumClientConnect('146.190.38.120', '50002');
    // }

    const newScripthashes = scripthashes.filter(
      (scripthash) => !this.subscribedScriptHashes.has(scripthash)
    );

    return await Promise.all(
      newScripthashes.map(async (scripthash: string) => {
        const connectionString = getElectrumConnectionString(scripthash);
        const connectionData = connectionString.split(':');

        await this.elecrumClientConnect(connectionData[0], connectionData[1]);

        this.subscribedScriptHashes.add(scripthash);
        const subscribeResponse =
          await this.electrumClient.blockchain_scripthash_subscribe(scripthash);
        return {
          scripthash,
          subscribeResponse
        };
      })
    );
  }

  async derivedData(xpubkey: string) {
    try {
      const { address, scripthash } = await getDerivedData(xpubkey);

      // if (!this.electrumClient) {
      //   await this.elecrumClientConnect('146.190.38.120', '50002');
      // }
      // const balance = await this.electrumClient.blockchain_scripthash_getBalance(scripthash);
      // console.log('balance', balance);
      const walletData: any = {
        publicKey: xpubkey,
        address,
        scriptHash: scripthash
        // balance
      };
      const newWalletData = await this.walletService.addWalletData(walletData);
      if (newWalletData?.id) {
        walletData.id = newWalletData.id;
      }
      return walletData;
    } catch (e) {
      console.log('e in ms', e);
      throw e;
    }
  }
}
