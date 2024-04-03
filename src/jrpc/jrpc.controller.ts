import { Body, Controller, Post } from '@nestjs/common';
import { JrpcService } from './jrpc.service';

@Controller('jrpc')
export class JrpcController {
  constructor(private readonly jrpcService: JrpcService) {}

  @Post()
  async handleJsonRpcRequest(@Body() body: any) {
    // Check if the required fields are present in the request
    if (!body || !body.jsonrpc || !body.method) {
      return { error: 'Invalid JSON-RPC request' };
    }

    // Handle the request based on the method
    switch (body.method) {
      case 'getBlockNumber':
        return {
          jsonrpc: '2.0',
          id: body.id,
          result: await this.jrpcService.getBlockNumber(),
        };
      case 'pm_sponsorUserOperation':
        return {
          jsonrpc: '2.0',
          id: body.id,
          result: await this.jrpcService.sponsorUserOperation(body.params),
        };
      // Add more cases for other methods
      default:
        return { error: 'Method not found' };
    }
  }
}
