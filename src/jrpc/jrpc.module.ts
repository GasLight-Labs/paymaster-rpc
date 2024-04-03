import { Module } from "@nestjs/common";
import { JrpcService } from "./jrpc.service";
import { JrpcController } from "./jrpc.controller";
import { WalletService } from "src/wallet/wallet.service";
import { ConfigService } from "src/config/config.service";

@Module({
  controllers: [JrpcController],
  providers: [WalletService, JrpcService, ConfigService],
})
export class JrpcModule {}
