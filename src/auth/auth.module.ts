import { Module } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { UsersModule } from "src/users/users.module";
import { PassportModule } from "@nestjs/passport";
import { LocalStrategy } from "./strategy/local.strategy";
import { AuthController } from "./auth.controller";
import { JwtModule } from "@nestjs/jwt";
import { JwtStrategy } from "./strategy/jwt.strategy";
import { ConfigModule } from "src/config/config.module";
import { ConfigService } from "src/config/config.service";
import { OidcStrategy } from "./strategy/oidc.strategy";
import { SessionSerializer } from "./serializer/session.serializer";

const OidcStrategyFactory = (provider: "google" | "github") => ({
  provide: `${provider}OidcStrategy`,
  useFactory: async (configService: ConfigService) => {
    const client = await configService.buildOpenIdClient(provider); // secret sauce! build the dynamic client before injecting it into the strategy for use in the constructor super call.
    const strategy = new OidcStrategy(configService, client);
    return strategy;
  },
  inject: [ConfigService],
});

@Module({
  imports: [
    ConfigModule,
    UsersModule,
    PassportModule.register({ session: true }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.jwtSecret,
        signOptions: { expiresIn: "60s" },
      }),
    }),
  ],
  providers: [AuthService, LocalStrategy, JwtStrategy, SessionSerializer, OidcStrategyFactory("google")],
  controllers: [AuthController],
})
export class AuthModule {}
