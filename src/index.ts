import { buildApp, createLogger } from "./app";

async function bootstrap() {
  const logger = await createLogger();
  const app = await buildApp();
  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen({ port, host: "0.0.0.0" });
  app.log.info(`API on http://localhost:${port}`);
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});