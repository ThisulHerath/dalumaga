import { createApp } from './app';
async function main() {
  if (
    (process.env.DALUMAGA_DEMO === 'true' || process.env.DALUMAGA_STAFF_SIMULATOR === 'true') &&
    process.env.HOST !== '127.0.0.1'
  ) {
    throw new Error('Sample mode requires HOST=127.0.0.1');
  }
  const app = await createApp();
  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT || 3000), process.env.HOST || '0.0.0.0');
}
void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
