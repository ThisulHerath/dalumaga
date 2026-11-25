import { createApp } from './app';
async function main() {
  const app = await createApp();
  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT || 3000), process.env.HOST || '0.0.0.0');
}
void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
