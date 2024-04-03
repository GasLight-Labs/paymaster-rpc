import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { JrpcModule } from './jrpc/jrpc.module';
import { WalletService } from './wallet/wallet.service';
import { ConfigModule } from './config/config.module';

@Module({
  imports: [JrpcModule, ConfigModule],
  controllers: [AppController],
  providers: [AppService, WalletService],
})
export class AppModule {}
