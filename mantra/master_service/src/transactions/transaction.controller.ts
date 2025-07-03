import { Body, Controller, Get, Post, Query, Req, Res } from '@nestjs/common';
import { TransactionService } from './transaction.service';
import { Request, Response } from 'express';
import { decodeVOutAsm } from 'src/utils/common';

@Controller('transaction')
export class TransactionController {
  constructor(private readonly transactionService: TransactionService) {}

  @Post()
  async createUnsignedTransaction(
    @Body('myPubkeys') myPubkeys?: Array<string>,
    @Body('myH106s') myH106s?: Array<string>,
    @Body('changeSource') changeSource?: string,
    @Body('eachOutputAddress') eachOutputAddress?: Array<string>,
    @Body('eachOutputAmount') eachOutputAmount?: Array<number>,
    @Body('eachOutputAsset') eachOutputAsset?: Array<string>,
    @Body('eachOutputAssetMemo') eachOutputAssetMemo?: Array<string>,
    @Body('eachOutputAssetMemoTimestamp') eachOutputAssetMemoTimestamp?: Array<number>,
    @Body('chainName') chainName?: string,
    @Body('feeRateKb') feeRateKb?: number
  ) {
    return this.transactionService.createTransaction({
      xpubkeys: myPubkeys,
      changeSource,
      eachOutputAddress,
      eachOutputAmount,
      eachOutputAsset,
      eachOutputAssetMemo,
      eachOutputAssetMemoTimestamp,
      scripthashes: myH106s,
      chainName,
      feeRateKb
    });
  }

  @Post('/history')
  async transactionHistory(
    @Res() res: Response,
    @Body('offset') offset: number,
    @Body('limit') limit: number,
    @Body('symbol') symbol: string,
    @Body('chainName') chainName: string,
    @Body('xpubkeys') xpubkeys?: Array<string>,
    @Body('myH106s') myH106s?: Array<string>
  ) {
    try {
      if (!symbol || !chainName) {
        return res.status(400).send({ error: 'Missing required fields' });
      }
      const transactionResponse = await this.transactionService.getTransactionHistories({
        symbol,
        chainName,
        // addresses: ['EN5vwDMCfLVonwVh4D7waBwtCT4mgPmzkJ'],
        xpubkeys: xpubkeys,
        scripthashes: myH106s,
        limit,
        offset
      });
      console.log('transactionResponse', transactionResponse);
      return res.send(transactionResponse);
    } catch (e) {
      console.log('Error in transactionHistory', e);
      return res.status(500).send({ error: e.message });
    }
  }

  @Post('/broadcast')
  async broadcastTransaction(
    @Res() res: Response,
    @Body('chainName') chainName: string,
    @Body('tx') tx: string
  ) {
    try {
      if (!chainName || !tx) {
        throw new Error('Missing required fields');
      }
      const result = await this.transactionService.broadcastTransaction(chainName, tx);

      console.log('broadcast result', result);
      return res.send(result);
    } catch (error) {
      console.log('Error in broadcastTransaction', error);
      return res.status(500).send({ error: error.message });
    }
  }
}
