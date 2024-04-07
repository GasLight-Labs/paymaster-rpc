import { ExtractJwt, Strategy } from "passport-jwt";
import { PassportStrategy } from "@nestjs/passport";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "src/config/config.service";
import { JwtService } from "@nestjs/jwt";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKeyProvider: function (request, rawJwtToken, done) {
        const payload = jwtService.decode(rawJwtToken);
        done(null, configService.jwtSecret);
      },
    });
  }

  async validate(payload: any) {
    return { userId: payload.sub, username: payload.username };
  }
}
