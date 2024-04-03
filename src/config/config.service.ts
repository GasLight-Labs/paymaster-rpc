import { Injectable } from "@nestjs/common";
import {
  PublicClient,
  http,
  createPublicClient,
  createWalletClient,
  WalletClient,
  Address,
  Account,
  Client,
  Transport,
  Chain,
  createClient,
  erc20Abi,
} from "viem";
import { arbitrum, polygonMumbai } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { BundlerClient, createBundlerClient } from "permissionless";
import { EntryPointAbi, VerifyingPaymasterAbi } from "./abi";
import axios from "axios";

@Injectable()
export class ConfigService {
  // public Contracts = {
  //   EntryPoint: "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789",
  //   Paymaster: "0x5E90A0F7455bEEbfa2dEF35e857E24a29ffe567F",
  //   Usdc: "0x3870419Ba2BBf0127060bCB37f69A1b1C090992B",
  // } as const;
  // public BundlerUrl = `https://skandha-2ct5w3uvcq-uc.a.run.app/80001`;
  // public chain = polygonMumbai;
  public Contracts = {
    EntryPoint: "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789",
    Paymaster: "0x75688705486405550239134Aa01e80E739f3b459",
    Usdc: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  } as const;
  public BundlerUrl = `https://skandha-2ct5w3uvcq-uc.a.run.app/42161`;
  public chain = arbitrum;
  public publicClient: PublicClient;
  public walletClient: WalletClient<Transport, typeof this.chain, Account>;
  public account: Account;
  public bundlerClient: BundlerClient<typeof this.Contracts.EntryPoint, Chain>;
  public Abis = {
    EntryPoint: EntryPointAbi,
    VerifyingPaymaster: VerifyingPaymasterAbi,
  };
  private PrivateKey: Address;
  public Prices = {
    Eth: 4000,
  };

  constructor() {
    this.PrivateKey = process.env.PRIVATE_KEY as Address;
    if (!this.PrivateKey) throw new Error("Private key not found!");
    // @ts-ignore
    this.publicClient = createPublicClient({
      transport: http(),
      chain: this.chain,
      batch: {
        multicall: { batchSize: 4096, wait: 200 },
      },
    });
    this.account = privateKeyToAccount(this.PrivateKey as Address);
    this.walletClient = createWalletClient({
      transport: http(),
      chain: this.chain,
      account: privateKeyToAccount(this.PrivateKey as Address),
    }) as any;

    this.bundlerClient = createBundlerClient({
      transport: http(this.BundlerUrl),
      entryPoint: this.Contracts.EntryPoint,
    });

    this.fetchEthPrice();
    setInterval(() => this.fetchEthPrice(), 1000 * 60 * 2);
  }

  async fetchEthPrice() {
    try {
      const res = await axios.get("https://min-api.cryptocompare.com/data/price?fsym=ETH&tsyms=USD");
      this.Prices.Eth = res.data.USD;
    } catch (err) {
      console.error("Error caught in interval ETH Price:", err);
      // Halt the server
      process.exit(1);
    }
  }
}






