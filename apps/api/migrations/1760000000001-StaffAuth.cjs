class StaffAuth1760000000001 {
  async up(queryRunner) {
    await queryRunner.query(`
      CREATE TABLE dalumaga.staff_credential (
        user_id uuid PRIMARY KEY REFERENCES dalumaga.app_user(id),
        username text NOT NULL UNIQUE CHECK (username = lower(username)),
        password_hash text NOT NULL,
        failed_attempts integer NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
        locked_until timestamptz
      );
      CREATE TABLE dalumaga.staff_session (
        token_hash text PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES dalumaga.app_user(id),
        expires_at timestamptz NOT NULL,
        revoked_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX staff_session_user_idx ON dalumaga.staff_session(user_id);
      CREATE TABLE dalumaga.trip_assignment (
        trip_id uuid NOT NULL REFERENCES dalumaga.trip(id),
        user_id uuid NOT NULL REFERENCES dalumaga.app_user(id),
        PRIMARY KEY(trip_id,user_id)
      );
      REVOKE ALL ON dalumaga.staff_credential, dalumaga.staff_session, dalumaga.trip_assignment FROM PUBLIC;
    `);
  }
  async down() {
    throw new Error('Use a reviewed forward migration.');
  }
}
module.exports = { StaffAuth1760000000001 };
