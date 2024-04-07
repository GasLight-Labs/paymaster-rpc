import { Controller, Get, Post, Request, Res, UseGuards } from "@nestjs/common";
import { LocalAuthGuard } from "./guard/local-auth.guard";
import { AuthService } from "./auth.service";
import { JwtAuthGuard } from "./guard/jwt-auth.guard";
import { Issuer } from "openid-client";
import { OidcGuard } from "./guard/oidc-auth.guard";

@Controller("auth")
export class AuthController {
  constructor(private authService: AuthService) {}

  @UseGuards(LocalAuthGuard)
  @Post("login")
  async login(@Request() req) {
    return this.authService.login(req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Get("profile")
  getProfile(@Request() req) {
    return req.user;
  }

  @UseGuards(OidcGuard)
  @Get("/login-oauth")
  loginOauth() {}

  @UseGuards(OidcGuard)
  @Get("/callback")
  loginCallback(@Res() res) {
    res.redirect("/");
  }

  @Get("/logout")
  async logout(@Request() req, @Res() res: Response) {
    const id_token = req.user ? req.user.id_token : undefined;
    // req.logout(console.log);
    req.session.destroy();
    // @ts-ignore
    res.redirect("/");
  }
}
