import { UserOperation } from "permissionless";
import { Address, Hex, concat, getAddress, pad, slice, toHex } from "viem";

export interface IUserOpSerialized {
  sender: Address;
  nonce: string;
  factory?: Address;
  factoryData?: Hex;
  callData: Hex;
  callGasLimit: string;
  verificationGasLimit: string;
  preVerificationGas: string;
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
  signature: Hex;
}

export interface IUserOp {
  sender: Address;
  nonce: bigint;
  factory?: Address;
  factoryData?: Hex;
  callData: Hex;
  callGasLimit: bigint;
  verificationGasLimit: bigint;
  preVerificationGas: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  paymaster?: Address;
  paymasterVerificationGasLimit?: bigint;
  paymasterPostOpGasLimit?: bigint;
  paymasterData?: Hex;
  signature: Hex;
}

export type Hex32 = `0x${string & { length: 64 }}`;
export function unpackPaymasterAndData(paymasterAndData: Hex) {
  if (paymasterAndData === "0x") {
    return {
      paymaster: null,
      paymasterVerificationGasLimit: null,
      paymasterPostOpGasLimit: null,
      paymasterData: null,
    };
  }
  return {
    paymaster: getAddress(slice(paymasterAndData, 0, 20)),
    paymasterVerificationGasLimit: BigInt(slice(paymasterAndData, 20, 36)),
    paymasterPostOpGasLimit: BigInt(slice(paymasterAndData, 36, 52)),
    paymasterData: slice(paymasterAndData, 52),
  };
}

export function getPaymasterAndData(
  unpackedUserOperation: Pick<
    UserOperation<"v0.7">,
    "paymaster" | "paymasterVerificationGasLimit" | "paymasterPostOpGasLimit" | "paymasterData"
  >,
) {
  return unpackedUserOperation.paymaster
    ? concat([
        unpackedUserOperation.paymaster,
        pad(toHex(unpackedUserOperation.paymasterVerificationGasLimit || BigInt(0)), {
          size: 16,
        }),
        pad(toHex(unpackedUserOperation.paymasterPostOpGasLimit || BigInt(0)), {
          size: 16,
        }),
        unpackedUserOperation.paymasterData || ("0x" as Hex),
      ])
    : "0x";
}

export function getGasLimits(unpackedUserOperation: UserOperation<"v0.7">) {
  return concat([
    pad(toHex(unpackedUserOperation.maxPriorityFeePerGas), {
      size: 16,
    }),
    pad(toHex(unpackedUserOperation.maxFeePerGas), { size: 16 }),
  ]) as Hex32;
}

export function getInitCode(unpackedUserOperation: UserOperation<"v0.7">) {
  return unpackedUserOperation.factory
    ? concat([unpackedUserOperation.factory, unpackedUserOperation.factoryData || ("0x" as Hex)])
    : "0x";
}

export function getAccountGasLimits(unpackedUserOperation: UserOperation<"v0.7">) {
  return concat([
    pad(toHex(unpackedUserOperation.verificationGasLimit), {
      size: 16,
    }),
    pad(toHex(unpackedUserOperation.callGasLimit), { size: 16 }),
  ]) as Hex32;
}
