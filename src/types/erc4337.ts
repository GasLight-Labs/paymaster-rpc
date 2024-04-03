import { Address } from 'viem';

export interface IUserOp {
  sender: Address;
  nonce: bigint;
  initCode: Address;
  callData: Address;
  callGasLimit: bigint;
  verificationGasLimit: bigint;
  preVerificationGas: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  paymasterAndData: Address;
  signature: Address;
}
