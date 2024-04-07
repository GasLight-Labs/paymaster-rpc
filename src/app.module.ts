import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { JrpcModule } from './jrpc/jrpc.module';
import { WalletService } from './wallet/wallet.service';
import { ConfigModule } from './config/config.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [JrpcModule, ConfigModule, AuthModule, UsersModule],
  controllers: [AppController],
  providers: [AppService, WalletService],
})
export class AppModule {}
