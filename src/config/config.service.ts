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
import { BundlerClient, createBundlerClient, ENTRYPOINT_ADDRESS_V06 } from "permissionless";
import { EntryPointAbi, VerifyingPaymasterAbi } from "./abi";
import axios from "axios";
import { Issuer } from "openid-client";

@Injectable()
export class ConfigService {
  public readonly supportedOidcClients = ["google"] as const;
  public readonly oidcIssuer = {
    google: "https://accounts.google.com",
  };
  public readonly oidcClientIds = {
    google: process.env.OAUTH2_GOOGLE_CLIENT_ID,
  };
  public readonly oidcClientSecrets = {
    google: process.env.OAUTH2_GOOGLE_CLIENT_SECRET,
  };
  public supportedChains = [arbitrum, polygonMumbai];
  public account: Account;
  public jwtSecret: string;
  public Contracts = {
    [arbitrum.id]: {
      EntryPoint: "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789",
      Paymaster: "0x75688705486405550239134Aa01e80E739f3b459",
      Usdc: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    },
    [polygonMumbai.id]: {
      EntryPoint: "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789",
      Paymaster: "0x5E90A0F7455bEEbfa2dEF35e857E24a29ffe567F",
      Usdc: "0x3870419Ba2BBf0127060bCB37f69A1b1C090992B",
    },
  } as const;
  private BundlerUrl = {
    [arbitrum.id]: `https://skandha-2ct5w3uvcq-uc.a.run.app/42161`,
    [polygonMumbai.id]: `https://skandha-2ct5w3uvcq-uc.a.run.app/80001`,
  };
  private _publicClient: { [key in keyof typeof this.BundlerUrl]: PublicClient };
  private _bundlerClient: {
    [key in keyof typeof this.BundlerUrl]: BundlerClient<typeof ENTRYPOINT_ADDRESS_V06, Chain>;
  };
  private _walletClient: {
    [key in keyof typeof this.BundlerUrl]: WalletClient<Transport, Chain, Account>;
  };
  public Abis = {
    EntryPoint: EntryPointAbi,
    VerifyingPaymaster: VerifyingPaymasterAbi,
  };
  private PrivateKey: Address;
  public Prices = {
    [arbitrum.id]: 4000,
    [polygonMumbai.id]: 1.5,
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
  bundlerClient(chainId: number) {
    if (!this._bundlerClient[chainId]) {
      if (!this.BundlerUrl[chainId]) throw new Error("Bundler not found!");
      this._bundlerClient[chainId] = createBundlerClient({
        transport: http(this.BundlerUrl[chainId]),
        entryPoint: this.Contracts[chainId].EntryPoint,
      });
    }
    return this._bundlerClient[chainId];
  }

  constructor() {
    this.PrivateKey = process.env.PRIVATE_KEY as Address;
    this.jwtSecret = process.env.JWT_SECRET;
    if (!this.PrivateKey || !this.jwtSecret) throw new Error("Env var not found!");

    this.account = privateKeyToAccount(this.PrivateKey as Address);

    // Price interval
    this.fetchEthPrice();
    setInterval(() => this.fetchEthPrice(), 1000 * 60 * 2);
  }

  public async buildOpenIdClient(clientId: (typeof this.supportedOidcClients)[number]) {
    const TrustIssuer = await Issuer.discover(`${this.oidcIssuer[clientId]}/.well-known/openid-configuration`);
    const client = new TrustIssuer.Client({
      client_id: this.oidcClientIds[clientId],
      client_secret: this.oidcClientSecrets[clientId],
    });
    return client;
  }

  async fetchEthPrice() {
    try {
      let res = await axios.get("https://min-api.cryptocompare.com/data/price?fsym=ETH&tsyms=USD");
      const ethPrice = res.data.USD;
      res = await axios.get("https://min-api.cryptocompare.com/data/price?fsym=MATIC&tsyms=USD");
      const maticPrice = res.data.USD;

      this.Prices[arbitrum.id] = ethPrice;
      this.Prices[polygonMumbai.id] = maticPrice;
    } catch (err) {
      console.error("Error caught in interval ETH Price:", err);
      // Halt the server
      process.exit(1);
    }
  }
}
