import { HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { WalletService } from "src/wallet/wallet.service";
import {
  Address,
  Hex,
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
import ERC20PaymasterAbi from "../config/abi/ERC20Paymaster";
import { UserOperation, getPackedUserOperation } from "permissionless";
import { ConfigService } from "src/config/config.service";
import {
  unpackPaymasterAndData,
  getPaymasterAndData,
  getGasLimits,
  getAccountGasLimits,
  getInitCode,
  IUserOp,
  IUserOpSerialized,
} from "src/types/erc4337";
import { VerifyingPaymasterAbi } from "src/config/abi";

@Injectable()
export class JrpcService {
  constructor(
    private readonly walletService: WalletService,
    private readonly configService: ConfigService,
  ) {}

  async getBlockNumber(chainId: number) {
    const blockNumber = await this.configService.publicClient(chainId).getBlockNumber();
    return "0x" + blockNumber.toString(16);
  }

  async getTokenExchangeRate(chainId: number) {
    return parseUnits(String(this.configService.Prices[chainId]), 6);
  }

  async estimateGasLimitsOfUserOp(userOp: IUserOp, isErc20Op: boolean, chainId: number) {
    const paymasterEncodedData = await this.generatePaymasterData(userOp, isErc20Op, chainId);
    console.log("for estimate", {
      callData: userOp.callData,
      callGasLimit: userOp.callGasLimit,
      maxFeePerGas: userOp.maxFeePerGas,
      maxPriorityFeePerGas: userOp.maxPriorityFeePerGas,
      nonce: userOp.nonce,
      preVerificationGas: userOp.preVerificationGas,
      sender: userOp.sender,
      signature: userOp.signature,
      verificationGasLimit: userOp.verificationGasLimit,
      factory: userOp.factory,
      factoryData: userOp.factoryData,
      paymaster: paymasterEncodedData.paymaster,
      paymasterData: isErc20Op ? undefined : paymasterEncodedData.paymasterData,
    });
    const estimation = await this.configService.bundlerClient(chainId).estimateUserOperationGas({
      userOperation: {
        callData: userOp.callData,
        callGasLimit: userOp.callGasLimit,
        maxFeePerGas: userOp.maxFeePerGas,
        maxPriorityFeePerGas: userOp.maxPriorityFeePerGas,
        nonce: userOp.nonce,
        preVerificationGas: userOp.preVerificationGas,
        sender: userOp.sender,
        signature: userOp.signature,
        verificationGasLimit: userOp.verificationGasLimit,
        factory: userOp.factory,
        factoryData: userOp.factoryData,
        paymaster: paymasterEncodedData.paymaster,
        paymasterData: isErc20Op ? undefined : paymasterEncodedData.paymasterData,
      },
    });
    console.log("estimation =>", estimation);
    return {
      ...userOp,
      callGasLimit: estimation.callGasLimit,
      // Must be more otherwise tx will fail
      verificationGasLimit: estimation.verificationGasLimit,
      preVerificationGas: estimation.preVerificationGas,
      paymasterPostOpGasLimit: estimation.paymasterPostOpGasLimit,
      paymaster: paymasterEncodedData.paymaster,
      paymasterVerificationGasLimit: estimation.paymasterVerificationGasLimit,
    } as IUserOp;
  }

  calculateGasInWei(args: {
    callGasLimit: bigint | string;
    preVerificationGas: bigint | string;
    verificationGasLimit: bigint | string;
    maxFeePerGas: bigint | string;
    paymasterVerificationGasLimit?: bigint | string;
    paymasterPostOpGasLimit?: bigint | string;
  }) {
    return (
      (BigInt(args.callGasLimit) +
        BigInt(args.preVerificationGas) +
        BigInt(args.verificationGasLimit) +
        BigInt(args.paymasterVerificationGasLimit || 0) +
        BigInt(args.paymasterPostOpGasLimit || 0)) *
      BigInt(args.maxFeePerGas)
    );
  }

  async calculateGasInErc20(gasInWei: bigint, chainId: number) {
    return BigInt(Number(formatUnits(gasInWei * (await this.getTokenExchangeRate(chainId)), 18)).toFixed());
  }

  async checkPaymasterApproval(sender: Address, tokenAmount: bigint, chainId: number) {
    const approvedAmount = await this.configService.publicClient(chainId).readContract({
      abi: erc20Abi,
      address: this.configService.Contracts[chainId].Usdc,
      functionName: "allowance",
      args: [sender, this.configService.Contracts[chainId].ERC20Paymaster],
    });
    if (approvedAmount < tokenAmount) {
      throw new HttpException({ error: "Paymaster not approved!" }, HttpStatus.BAD_REQUEST);
    }
  }

  async validateErc20Payment(userOp: UserOperation<"v0.7">, chainId: number) {
    const gasInWei = this.calculateGasInWei(userOp);
    const gasInTokens = await this.calculateGasInErc20(gasInWei, chainId);
    const bal = await this.walletService.getErc20Balance(
      {
        tokenAddress: this.configService.Contracts[chainId].Usdc,
        account: userOp.sender,
      },
      chainId,
    );
    await this.checkPaymasterApproval(userOp.sender, gasInTokens, chainId);
    if (bal < gasInTokens) {
      throw new HttpException({ error: "Insufficient token balance for gas!" }, HttpStatus.BAD_REQUEST);
    }
    await this.checkPaymasterApproval(userOp.sender, gasInTokens, chainId);
  }

  async getHash(userOp: IUserOp, isErc20Op: boolean, validUntil: number, validAfter: number, chainId: number) {
    console.log("getting hash...");
    let hash = "0x";
    if (isErc20Op) {
      hash = await this.configService.publicClient(chainId).readContract({
        abi: ERC20PaymasterAbi,
        address: this.configService.Contracts[chainId].ERC20Paymaster,
        functionName: "getHash",
        // TODO: change token limit last arg
        args: [getPackedUserOperation(userOp), validUntil, validAfter, maxUint256],
      });
    } else
      hash = await this.configService.publicClient(chainId).readContract({
        abi: VerifyingPaymasterAbi,
        address: this.configService.Contracts[chainId].VerifyingPaymaster,
        functionName: "getHash",
        args: [getPackedUserOperation(userOp), validUntil, validAfter],
      });
    console.log("hash...");
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

  // signauture false for estimation purposes
  async generatePaymasterData(userOp: IUserOp, isErc20Op: boolean, chainId: number, _signature: boolean = false) {
    const { validAfter, validUntil } = this.calcValidity();
    let signature = await this.configService.walletClient(chainId).signMessage({
      message: { raw: toBytes(0) },
      account: this.configService.account,
    });
    if (_signature && !isErc20Op) {
      console.time("hash");
      const { hash } = await this.getHash(userOp, isErc20Op, validUntil, validAfter, chainId);
      console.timeEnd("hash");
      signature = await this.configService.walletClient(chainId).signMessage({
        message: { raw: toBytes(hash) },
        account: this.configService.account,
      });
    }

    // Construct the paymaster data
    const extraData = encodeAbiParameters(parseAbiParameters("uint48, uint48"), [validUntil, validAfter]);
    // const paymasterAndData: Address = `${getPaymasterAndData({
    //   paymaster: this.configService.Contracts[chainId].VerifyingPaymaster,
    //   paymasterVerificationGasLimit: userOp.paymasterVerificationGasLimit || 0n,
    //   paymasterPostOpGasLimit: userOp.paymasterPostOpGasLimit || 0n,
    //   paymasterData: extraData,
    // })}${signature.slice(2)}`;

    return {
      paymaster: isErc20Op
        ? this.configService.Contracts[chainId].ERC20Paymaster
        : this.configService.Contracts[chainId].VerifyingPaymaster,
      paymasterVerificationGasLimit: userOp.paymasterVerificationGasLimit,
      paymasterPostOpGasLimit: userOp.paymasterPostOpGasLimit,
      paymasterData: isErc20Op ? undefined : (`${extraData}${signature.slice(2)}` as Hex),
    };
  }

  deserializeUserOp(userOp: IUserOpSerialized): IUserOp {
    return {
      callData: userOp.callData,
      callGasLimit: BigInt(userOp.callGasLimit),
      maxFeePerGas: BigInt(userOp.maxFeePerGas),
      maxPriorityFeePerGas: BigInt(userOp.maxPriorityFeePerGas),
      nonce: BigInt(userOp.nonce),
      preVerificationGas: BigInt(userOp.preVerificationGas),
      sender: userOp.sender,
      signature: userOp.signature,
      verificationGasLimit: BigInt(userOp.verificationGasLimit),
      factory: userOp.factory,
      factoryData: userOp.factoryData,
    };
  }

  async signUserOP(argUserOp: IUserOpSerialized, isErc20Op: boolean = false, chainId: number) {
    let userOp = await this.estimateGasLimitsOfUserOp(this.deserializeUserOp(argUserOp), isErc20Op, chainId);
    if (isErc20Op) {
      return userOp;
    }
    const data = await this.generatePaymasterData(userOp, isErc20Op, chainId, true);
    userOp.paymaster = data.paymaster;
    userOp.paymasterData = data.paymasterData;
    userOp.paymasterPostOpGasLimit = data.paymasterPostOpGasLimit;
    userOp.paymasterVerificationGasLimit = data.paymasterVerificationGasLimit;
    return userOp;
  }

  async sponsorUserOperation(
    argUserOp: [IUserOpSerialized, Address, { type: "erc20Token" | "ether" }],
    chainId: number,
  ) {
    try {
      const isErc20Op = argUserOp[2].type === "erc20Token";
      let userOp = await this.signUserOP(argUserOp[0], isErc20Op, chainId);

      if (isErc20Op) {
        await this.validateErc20Payment(userOp, chainId);
      }
      return {
        callGasLimit: "0x" + userOp.callGasLimit.toString(16),
        preVerificationGas: "0x" + userOp.preVerificationGas.toString(16),
        verificationGasLimit: "0x" + userOp.verificationGasLimit.toString(16),
        paymaster: userOp.paymaster,
        paymasterVerificationGasLimit: "0x" + userOp.paymasterVerificationGasLimit.toString(16),
        paymasterPostOpGasLimit: "0x" + userOp.paymasterPostOpGasLimit.toString(16),
        paymasterData: userOp.paymasterData,
      };
    } catch (error) {
      console.log(error);
      throw new HttpException(
        {
          error: error.details || error.details || error.response?.error,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
