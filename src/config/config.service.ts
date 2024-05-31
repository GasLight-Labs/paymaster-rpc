import { Injectable } from "@nestjs/common";
import {
  PublicClient,
  http,
  createPublicClient,
  createWalletClient,
  WalletClient,
  Address,
  Account,
  Transport,
  Chain,
} from "viem";
import { arbitrum } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { BundlerClient, createBundlerClient, ENTRYPOINT_ADDRESS_V07 } from "permissionless";
import { EntryPointAbi, VerifyingPaymasterAbi } from "./abi";
import axios from "axios";
import { ENTRYPOINT_ADDRESS_V07_TYPE } from "permissionless/_types/types";

@Injectable()
export class ConfigService {
  public supportedChains = [arbitrum];
  public account: Account;
  public Contracts: {
    [key: number]: {
      EntryPoint: Address;
      // VerifyingPaymaster: Address;
      // ERC20Paymaster: Address;
      Usdc: Address;
      UniversalPaymaster: Address;
    };
  } = {
    [arbitrum.id]: {
      EntryPoint: ENTRYPOINT_ADDRESS_V07,
      UniversalPaymaster: "0xDACDA34b8b3d9dF839F14e87699e594329FD0a83",
      Usdc: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    },
  };
  private BundlerUrl = {
    [arbitrum.id]: `https://bundler-293f2fe8c150.herokuapp.com`,
  };
  // @ts-expect-error
  private _publicClient: { [key in keyof typeof this.BundlerUrl]: PublicClient } = {};
  // @ts-expect-error
  private _bundlerClient: {
    [key in keyof typeof this.BundlerUrl]: BundlerClient<typeof ENTRYPOINT_ADDRESS_V07, Chain>;
  } = {};
  // @ts-expect-error
  private _walletClient: {
    [key in keyof typeof this.BundlerUrl]: WalletClient<Transport, Chain, Account>;
  } = {};
  public Abis = {
    EntryPoint: EntryPointAbi,
    VerifyingPaymaster: VerifyingPaymasterAbi,
  };
  private PrivateKey: Address;
  public Prices = {
    [arbitrum.id]: 4000,
  };

  publicClient(chainId: number) {
    if (!this._publicClient[chainId]) {
      const chain = this.supportedChains.find((c) => c.id === chainId);
      if (!chain) throw new Error("Chain not found!");
      this._publicClient[chainId] = createPublicClient({
        transport: http(),
        chain,
        batch: {
          multicall: { batchSize: 4096, wait: 200 },
        },
      });
    }
    return this._publicClient[chainId];
  }
  walletClient(chainId: number) {
    if (!this._walletClient[chainId]) {
      const chain = this.supportedChains.find((c) => c.id === chainId);
      if (!chain) throw new Error("Chain not found!");
      this._walletClient[chainId] = createWalletClient({
        transport: http(),
        chain,
        account: this.account,
      }) as any;
    }
    return this._walletClient[chainId];
  }
  bundlerClient(chainId: number): BundlerClient<ENTRYPOINT_ADDRESS_V07_TYPE, Chain> {
    if (!this._bundlerClient[chainId]) {
      if (!this.BundlerUrl[chainId]) throw new Error("Bundler not found!");
      this._bundlerClient[chainId] = createBundlerClient({
        transport: http(this.BundlerUrl[chainId]),
        // @ts-ignore
        entryPoint: this.Contracts[chainId].EntryPoint,
      });
    }
    return this._bundlerClient[chainId];
  }

  constructor() {
    this.PrivateKey = process.env.PRIVATE_KEY as Address;
    if (!this.PrivateKey) throw new Error("Private key not found!");

    this.account = privateKeyToAccount(this.PrivateKey as Address);

    // Price interval
    this.fetchEthPrice();
    setInterval(() => this.fetchEthPrice(), 1000 * 60 * 2);
  }

  async fetchEthPrice() {
    try {
      let res = await axios.get("https://min-api.cryptocompare.com/data/price?fsym=ETH&tsyms=USD");
      const ethPrice = res.data.USD;

      this.Prices[arbitrum.id] = ethPrice;
    } catch (err) {
      console.error("Error caught in interval ETH Price:", err);
      // Halt the server
      process.exit(1);
    }
  }
}
