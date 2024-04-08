import { PassportStrategy } from "@nestjs/passport";
import { Injectable } from "@nestjs/common";
import { Strategy, Client, UserinfoResponse, TokenSet, Issuer } from "openid-client";
import { ConfigService } from "src/config/config.service";

@Injectable()
export class OidcStrategy extends PassportStrategy(Strategy, "oidc") {
  client: Client;
  constructor(
    private readonly configService: ConfigService,
    client: Client,
  ) {
    super({
      client: client,
      params: {
        redirect_uri: process.env.OAUTH2_CLIENT_REGISTRATION_LOGIN_REDIRECT_URI,
        scope: "openid profile",
      },
      passReqToCallback: false,
      usePKCE: false,
    });

    this.client = client;
  }

  async validate(tokenset: TokenSet) {
    const userinfo: UserinfoResponse = await this.client.userinfo(tokenset);
    console.log("userinfo =>", userinfo);
    const id_token = tokenset.id_token;
    const access_token = tokenset.access_token;
    const refresh_token = tokenset.refresh_token;
    const user = {
      id_token,
      access_token,
      refresh_token,
      userinfo,
    };
    return { userId: user.userinfo.sub, username: user.userinfo.name };
  }
}
