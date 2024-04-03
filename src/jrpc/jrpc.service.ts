import { HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { WalletService } from "src/wallet/wallet.service";
import {
  Address,
  encodeAbiParameters,
  erc20Abi,
  formatUnits,
  maxUint256,
  parseAbiParameters,
  parseUnits,
  toBytes,
  zeroAddress,
} from "viem";
import VerifyPaymasterAbi from "../config/abi/VerifyingPaymaster";
import { IUserOp } from "src/types/erc4337";
import { UserOperation } from "permissionless";
import { ConfigService } from "src/config/config.service";

@Injectable()
export class JrpcService {
  constructor(
    private readonly walletService: WalletService,
    private readonly configService: ConfigService,
  ) {}

  async getBlockNumber() {
    const blockNumber = await this.configService.publicClient.getBlockNumber();
    return "0x" + blockNumber.toString(16);
  }

  async getTokenExchangeRate() {
    return parseUnits(String(this.configService.Prices.Eth), 6);
  }

  async estimateGasLimitsOfUserOp(userOp: IUserOp, isErc20Op: boolean) {
    const paymasterData = await this.generatePaymasterData(userOp, isErc20Op);
    const estimation = await this.configService.bundlerClient.estimateUserOperationGas({
      // @ts-ignore
      userOperation: {
        sender: userOp.sender,
        nonce: BigInt(userOp.nonce),
        initCode: userOp.initCode,
        callData: userOp.callData,
        maxFeePerGas: BigInt(userOp.maxFeePerGas),
        maxPriorityFeePerGas: BigInt(userOp.maxPriorityFeePerGas),
        paymasterAndData: paymasterData,
        signature: userOp.signature,
        callGasLimit: 0n,
        verificationGasLimit: 0n,
        preVerificationGas: 0n,
      },
      // @ts-ignore
      entryPoint: this.walletService.EntryPointAddress,
    });
    return {
      ...userOp,
      callGasLimit: estimation.callGasLimit,
      // Must be more otherwise tx will fail
      verificationGasLimit: BigInt((Number(estimation.verificationGasLimit) * 1.3).toFixed()),
      preVerificationGas: estimation.preVerificationGas,
    };
  }

  calculateGasInWei(args: {
    callGasLimit: bigint | string;
    preVerificationGas: bigint | string;
    verificationGasLimit: bigint | string;
    maxFeePerGas: bigint | string;
  }) {
    return (
      (BigInt(args.callGasLimit) + BigInt(args.preVerificationGas) + BigInt(args.verificationGasLimit)) *
      BigInt(args.maxFeePerGas)
    );
  }

  async calculateGasInErc20(gasInWei: bigint) {
    return BigInt(Number(formatUnits(gasInWei * (await this.getTokenExchangeRate()), 18)).toFixed());
  }

  async checkPaymasterApproval(sender: Address) {
    const approvedAmount = await this.configService.publicClient.readContract({
      abi: erc20Abi,
      address: this.configService.Contracts.Usdc,
      functionName: "allowance",
      args: [sender, this.configService.Contracts.Paymaster],
    });
    if (approvedAmount < maxUint256) {
      throw new HttpException({ error: "Paymaster not approved!" }, HttpStatus.BAD_REQUEST);
    }
  }

  async validateErc20Payment(userOp: IUserOp) {
    await this.checkPaymasterApproval(userOp.sender);
    const gasInWei = this.calculateGasInWei(userOp);
    const gasInTokens = await this.calculateGasInErc20(gasInWei);
    const bal = await this.walletService.getErc20Balance({
      tokenAddress: this.configService.Contracts.Usdc,
      account: userOp.sender,
    });
    if (bal < gasInTokens) {
      throw new HttpException({ error: "Insufficient token balance for gas!" }, HttpStatus.BAD_REQUEST);
    }
  }

  async getHash(userOp: UserOperation<"v0.6">, isErc20Op: boolean, exchangeRate: bigint) {
    const { validAfter, validUntil } = this.calcValidity();
    const hash = await this.configService.publicClient.readContract({
      abi: VerifyPaymasterAbi,
      address: this.configService.Contracts.Paymaster,
      functionName: "getHash",
      args: [userOp, validUntil, validAfter, isErc20Op ? this.configService.Contracts.Usdc : zeroAddress, exchangeRate],
    });
    // const packedUserOp = encodeAbiParameters(
    //   parseAbiParameters(
    //     'address, uint256, bytes, bytes, uint256, uint256, uint256, uint256, uint256',
    //   ),
    //   [
    //     userOp.sender,
    //     userOp.nonce,
    //     keccak256(userOp.initCode),
    //     keccak256(userOp.callData),
    //     userOp.callGasLimit,
    //     userOp.verificationGasLimit,
    //     userOp.preVerificationGas,
    //     userOp.maxFeePerGas,
    //     userOp.maxPriorityFeePerGas,
    //   ],
    // );
    // const hash = keccak256(
    //   encodeAbiParameters(
    //     parseAbiParameters(
    //       'bytes, uint256, address, uint48, uint48, address, uint256',
    //     ),
    //     [
    //       packedUserOp,
    //       80001n,
    //       this.walletService.PaymasterAddress,
    //       validUntil,
    //       validAfter,
    //       isErc20Op ? this.configService.Contracts.Usdc : zeroAddress,
    //       exchangeRate,
    //     ],
    //   ),
    // );
    return { hash, validUntil, validAfter };
  }

  calcValidity() {
    const validUntil = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
    const validAfter = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
    return { validAfter, validUntil };
  }

  async generatePaymasterData(userOp: UserOperation<"v0.6">, isErc20Op: boolean) {
    const exchangeRate = isErc20Op ? await this.getTokenExchangeRate() : 0n; // Example exchange rate
    console.time("hash");
    const { hash, validUntil, validAfter } = await this.getHash(userOp, isErc20Op, exchangeRate);
    console.timeEnd("hash");
    const signature = await this.configService.walletClient.signMessage({
      message: { raw: toBytes(hash) },
      account: this.configService.account,
    });
    // Construct the paymaster data
    const extraData = encodeAbiParameters(parseAbiParameters("uint48, uint48, address, uint256"), [
      validUntil,
      validAfter,
      isErc20Op ? this.configService.Contracts.Usdc : zeroAddress,
      exchangeRate,
    ]);
    const paymasterAndData =
      `${this.configService.Contracts.Paymaster}${extraData.slice(2)}${signature.slice(2)}` as Address;
    return paymasterAndData;
  }

  async signUserOP(argUserOp: IUserOp, isErc20Op: boolean = false) {
    let userOp = await this.estimateGasLimitsOfUserOp(argUserOp, isErc20Op);
    const paymasterAndData = await this.generatePaymasterData(userOp, isErc20Op);
    userOp.paymasterAndData = paymasterAndData;
    return userOp;
  }

  async sponsorUserOperation(argUserOp: [IUserOp, Address, { type: "erc20Token" | "ether" }]) {
    try {
      const isErc20Op = argUserOp[2].type === "erc20Token";
      let userOp = await this.signUserOP(argUserOp[0], isErc20Op);

      if (isErc20Op) {
        await this.validateErc20Payment(userOp);
      }
      return {
        paymasterAndData: userOp.paymasterAndData,
        callGasLimit: "0x" + userOp.callGasLimit.toString(16),
        preVerificationGas: "0x" + userOp.preVerificationGas.toString(16),
        verificationGasLimit: "0x" + userOp.verificationGasLimit.toString(16),
      };
    } catch (error) {
      throw new HttpException(
        {
          error: error.details || error.details || error.response?.error,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
