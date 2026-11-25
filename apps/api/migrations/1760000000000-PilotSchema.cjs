const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

class PilotSchema1760000000000 {
  async up(queryRunner) {
    const sql = readFileSync(resolve(__dirname, '../../../db/001_pilot.sql'), 'utf8').trim();
    // TypeORM owns the transaction that also records the migration in its ledger.
    if (!/^BEGIN;\s/.test(sql) || !/\sCOMMIT;$/.test(sql))
      throw new Error('Expected one wrapped pilot migration');
    await queryRunner.query(sql.replace(/^BEGIN;\s*/, '').replace(/\s*COMMIT;$/, ''));
    await queryRunner.query('SET LOCAL search_path = public, pg_catalog');
  }
  async down() {
    throw new Error('Pilot evidence is append-only. Use a reviewed forward migration.');
  }
}
module.exports = { PilotSchema1760000000000 };
