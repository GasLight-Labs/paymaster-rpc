import { NestFactory } from "@nestjs/core";
import dotenv from "dotenv";
dotenv.config();
import { AppModule } from "./app.module";
import passport from "passport";
import session from "express-session";
import MongoStore from "connect-mongo";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: true });

  // Authentication & Session
  app.use(
    session({
      store: MongoStore.create({ mongoUrl: process.env.MONGO_URI }),
      secret: process.env.SESSION_SECRET, // to sign session id
      resave: false, // will default to false in near future: https://github.com/expressjs/session#resave
      saveUninitialized: false, // will default to false in near future: https://github.com/expressjs/session#saveuninitialized
      rolling: true, // keep session alive
      cookie: {
        maxAge: 30 * 60 * 1000, // session expires in 1hr, refreshed by `rolling: true` option.
        httpOnly: true, // so that cookie can't be accessed via client-side script
      },
    }),
  );
  app.use(passport.initialize());
  app.use(passport.session());
  await app.listen(process.env.PORT || 8000);
}
bootstrap();

