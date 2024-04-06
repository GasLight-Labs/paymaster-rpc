import { Injectable } from "@nestjs/common";
import { Address, erc20Abi } from "viem";
import { ConfigService } from "src/config/config.service";

@Injectable()
export class WalletService {
  constructor(readonly configService: ConfigService) {}

  async getErc20Balance(args: { tokenAddress: Address; account: Address }, chainId: number) {
    return await this.configService.publicClient(chainId).readContract({
      abi: erc20Abi,
      address: args.tokenAddress,
      functionName: "balanceOf",
      args: [args.account],
    });
  }
}
