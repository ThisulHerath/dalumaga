const { DataSource } = require('typeorm');
const { PilotSchema1760000000000 } = require('../migrations/1760000000000-PilotSchema.cjs');
const { StaffAuth1760000000001 } = require('../migrations/1760000000001-StaffAuth.cjs');
const { StaffDevices1760000000002 } = require('../migrations/1760000000002-StaffDevices.cjs');

async function main() {
  const command = process.argv[2];
  if (!['run', 'status'].includes(command)) throw new Error('Expected run or status');
  if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL in apps/api/.env');
  const db = new DataSource({
    type: 'postgres',
    url: process.env.DATABASE_URL,
    schema: 'public',
    synchronize: false,
    migrationsTableName: 'dalumaga_migrations',
    migrations: [PilotSchema1760000000000, StaffAuth1760000000001, StaffDevices1760000000002],
  });
  await db.initialize();
  try {
    if (command === 'status') {
      console.log((await db.showMigrations()) ? 'Pending migrations' : 'Database is up to date');
    } else {
      const applied = await db.runMigrations({ transaction: 'all' });
      console.log(
        applied.length
          ? applied.map((migration) => migration.name).join('\n')
          : 'Database is up to date',
      );
    }
  } finally {
    await db.destroy();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
