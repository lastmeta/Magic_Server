import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import { NodeService } from './node.service';
import { Request } from 'express';

@Controller('node')
export class NodeController {
  constructor(private readonly nodeService: NodeService) {}

  @Post()
  async create(
    @Req() request: Request,
    @Body('chain') chain: string,
    @Body('port') port: number,
    @Body('donation_address') donation_address: string
  ) {
    try {
      const ip = request.ip;

      return this.nodeService.addNodes({
        chain,
        port: port.toString(),
        ip,
        donation_address
      });
    } catch (err) {
      return {
        err: err.message
      };
    }
  }

  @Get()
  async getNodes(
    @Query('chain') chain: string,
    @Query('skip') skip?: string,
    @Query('limit') limit?: string
  ) {
    return this.nodeService.getRecentNodes({
      chain,
      skip: parseInt(skip || '0'),
      limit: parseInt(limit || '0')
    });
  }
}
