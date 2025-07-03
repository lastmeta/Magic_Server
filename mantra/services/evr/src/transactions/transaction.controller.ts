import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import { TransactionService } from './transaction.service';

@Controller('transaction')
export class TransactionController {
  constructor(private readonly transactionService: TransactionService) {}

  @Get()
  async findAll() {
    return await this.transactionService.findAll();
  }

  @Get()
  async getTransactionDetails(@Query('id') id: string) {
    return this.transactionService.getTransactionDetails(parseInt(id));
  }
}
