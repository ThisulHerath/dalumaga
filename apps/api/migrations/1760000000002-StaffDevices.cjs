class StaffDevices1760000000002 {
  async up(queryRunner) {
    await queryRunner.query(`
      CREATE TABLE dalumaga.staff_device (
        id uuid PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES dalumaga.app_user(id),
        label text NOT NULL CHECK (length(trim(label)) BETWEEN 1 AND 80),
        secret_hash text NOT NULL CHECK (secret_hash ~ '^[a-f0-9]{64}$'),
        enrolled_at timestamptz NOT NULL DEFAULT now(),
        revoked_at timestamptz
      );
      ALTER TABLE dalumaga.staff_session ADD COLUMN device_id uuid REFERENCES dalumaga.staff_device(id);
      CREATE INDEX staff_device_user_idx ON dalumaga.staff_device(user_id);
      CREATE INDEX staff_session_device_idx ON dalumaga.staff_session(device_id);
      REVOKE ALL ON dalumaga.staff_device FROM PUBLIC;
    `);
  }
  async down() {
    throw new Error('Use a reviewed forward migration.');
  }
}
module.exports = { StaffDevices1760000000002 };
