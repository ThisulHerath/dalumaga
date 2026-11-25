BEGIN;
CREATE SCHEMA dalumaga;
SET LOCAL search_path = dalumaga, pg_catalog;
CREATE TYPE weigh_stage AS ENUM ('pickup','receipt');
CREATE TYPE event_kind AS ENUM ('weigh','correction','decision','stop','resume','handover');
CREATE TYPE stop_reason AS ENUM ('tea','toilet','breakdown','emergency','other');
CREATE TYPE alert_kind AS ENUM ('weight_difference','late_risk','unexplained_stop','emergency');
CREATE DOMAIN kg AS numeric CHECK (VALUE >= 0 AND VALUE < 1000000 AND VALUE = round(VALUE,3));

CREATE TABLE app_user (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), auth_subject text NOT NULL UNIQUE, display_name text NOT NULL, enabled boolean NOT NULL DEFAULT true);
CREATE TABLE role (code text PRIMARY KEY);
INSERT INTO role VALUES ('weigher'),('driver'),('receiver'),('dispatcher'),('manager'),('admin');
CREATE TABLE user_role (user_id uuid REFERENCES app_user, role_code text REFERENCES role, PRIMARY KEY(user_id,role_code));
CREATE TABLE factory (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, timezone text NOT NULL DEFAULT 'Asia/Colombo');
CREATE TABLE route (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), factory_id uuid NOT NULL REFERENCES factory, name text NOT NULL, UNIQUE(factory_id,name));
CREATE TABLE pickup_point (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL);
CREATE TABLE route_stop (route_id uuid REFERENCES route, sequence_no integer CHECK(sequence_no>0), point_id uuid NOT NULL REFERENCES pickup_point, PRIMARY KEY(route_id,sequence_no));
CREATE TABLE vehicle (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), registration text NOT NULL UNIQUE);
CREATE TABLE trip (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), route_id uuid NOT NULL REFERENCES route, vehicle_id uuid NOT NULL REFERENCES vehicle, driver_id uuid NOT NULL REFERENCES app_user, departed_at timestamptz, ended_at timestamptz, CHECK(ended_at IS NULL OR (departed_at IS NOT NULL AND ended_at>=departed_at)));
CREATE INDEX trip_vehicle_time ON trip(vehicle_id,departed_at);
CREATE TABLE batch (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), trip_id uuid NOT NULL REFERENCES trip, point_id uuid NOT NULL REFERENCES pickup_point, start_at timestamptz, deadline_at timestamptz, completed_at timestamptz, timing_rule text, CHECK(deadline_at IS NULL OR (timing_rule IS NOT NULL AND (start_at IS NULL OR deadline_at>=start_at))));
CREATE INDEX batch_open_deadlines ON batch(deadline_at) WHERE completed_at IS NULL;
CREATE INDEX batch_trip ON batch(trip_id);
CREATE TABLE crate (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), qr_code text NOT NULL UNIQUE);
CREATE TABLE device_scale (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), asset_code text NOT NULL UNIQUE, resolution_kg kg NOT NULL CHECK(resolution_kg>0));
CREATE TABLE crate_tare (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), crate_id uuid NOT NULL REFERENCES crate, empty_kg kg NOT NULL CHECK(empty_kg>0), verified_at timestamptz NOT NULL, valid_until timestamptz, verified_by uuid NOT NULL REFERENCES app_user, scale_id uuid NOT NULL REFERENCES device_scale, condition_note text NOT NULL, UNIQUE(id,crate_id), CHECK(valid_until IS NULL OR valid_until>verified_at));
CREATE INDEX tare_history ON crate_tare(crate_id,verified_at DESC);
CREATE TABLE crate_load (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), batch_id uuid NOT NULL REFERENCES batch, crate_id uuid NOT NULL REFERENCES crate, UNIQUE(id,crate_id));
CREATE INDEX load_batch ON crate_load(batch_id);
CREATE TABLE weight_rule (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tolerance_kg kg NOT NULL, approved_by uuid NOT NULL REFERENCES app_user, approved_at timestamptz NOT NULL);
CREATE TABLE load_rule (load_id uuid PRIMARY KEY REFERENCES crate_load, rule_id uuid NOT NULL REFERENCES weight_rule);

CREATE TABLE client_event (client_event_id uuid PRIMARY KEY, kind event_kind NOT NULL, actor_id uuid NOT NULL REFERENCES app_user, device_id uuid NOT NULL, occurred_at timestamptz NOT NULL, received_at timestamptz NOT NULL DEFAULT clock_timestamp(), payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'), UNIQUE(client_event_id,kind));
CREATE TABLE weigh_event (id uuid PRIMARY KEY, kind event_kind GENERATED ALWAYS AS ('weigh'::event_kind) STORED, load_id uuid NOT NULL, crate_id uuid NOT NULL, stage weigh_stage NOT NULL, scale_id uuid NOT NULL REFERENCES device_scale, gross_kg kg NOT NULL, tare_id uuid, capture_method text NOT NULL CHECK(capture_method IN ('scale','manual','simulator')), verified boolean NOT NULL DEFAULT false, UNIQUE(load_id,stage), FOREIGN KEY(id,kind) REFERENCES client_event(client_event_id,kind), FOREIGN KEY(load_id,crate_id) REFERENCES crate_load(id,crate_id), FOREIGN KEY(tare_id,crate_id) REFERENCES crate_tare(id,crate_id), CHECK(NOT verified OR tare_id IS NOT NULL));
CREATE TABLE correction (id uuid PRIMARY KEY, kind event_kind GENERATED ALWAYS AS ('correction'::event_kind) STORED, weigh_id uuid NOT NULL REFERENCES weigh_event, base_revision integer NOT NULL CHECK(base_revision>=0), gross_kg kg NOT NULL, tare_id uuid NOT NULL REFERENCES crate_tare, reason text NOT NULL CHECK(length(trim(reason))>0), FOREIGN KEY(id,kind) REFERENCES client_event(client_event_id,kind), UNIQUE(id,weigh_id,base_revision));
CREATE TABLE correction_decision (id uuid PRIMARY KEY, kind event_kind GENERATED ALWAYS AS ('decision'::event_kind) STORED, correction_id uuid NOT NULL UNIQUE, weigh_id uuid NOT NULL, base_revision integer NOT NULL, approved boolean NOT NULL, reason text NOT NULL CHECK(length(trim(reason))>0), FOREIGN KEY(id,kind) REFERENCES client_event(client_event_id,kind), FOREIGN KEY(correction_id,weigh_id,base_revision) REFERENCES correction(id,weigh_id,base_revision));
CREATE UNIQUE INDEX single_approved_successor ON correction_decision(weigh_id,base_revision) WHERE approved;
CREATE FUNCTION check_reading() RETURNS trigger LANGUAGE plpgsql SET search_path=dalumaga,pg_catalog AS $$
DECLARE target_crate uuid; captured timestamptz; t crate_tare;
BEGIN
 IF TG_TABLE_NAME='weigh_event' THEN
   IF NOT NEW.verified THEN RETURN NEW; END IF;
   target_crate:=NEW.crate_id;
   SELECT occurred_at INTO STRICT captured FROM client_event WHERE client_event_id=NEW.id;
 ELSE
   SELECT w.crate_id,e.occurred_at INTO STRICT target_crate,captured FROM weigh_event w JOIN client_event e ON e.client_event_id=w.id WHERE w.id=NEW.weigh_id;
 END IF;
 SELECT * INTO STRICT t FROM crate_tare WHERE id=NEW.tare_id;
 IF t.crate_id<>target_crate OR NEW.gross_kg<t.empty_kg OR captured<t.verified_at OR captured>=t.valid_until THEN
   RAISE EXCEPTION 'Invalid tare for this weighing';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER validate_weigh BEFORE INSERT ON weigh_event FOR EACH ROW EXECUTE FUNCTION check_reading();
CREATE TRIGGER validate_correction BEFORE INSERT ON correction FOR EACH ROW EXECUTE FUNCTION check_reading();
CREATE FUNCTION check_revision() RETURNS trigger LANGUAGE plpgsql SET search_path=dalumaga,pg_catalog AS $$
BEGIN
 IF NEW.approved AND NEW.base_revision>0 AND NOT EXISTS(SELECT FROM correction_decision WHERE weigh_id=NEW.weigh_id AND approved AND base_revision=NEW.base_revision-1) THEN
   RAISE EXCEPTION 'Missing approved predecessor';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER validate_revision BEFORE INSERT ON correction_decision FOR EACH ROW EXECUTE FUNCTION check_revision();

CREATE TABLE stop_event (id uuid PRIMARY KEY, kind event_kind NOT NULL CHECK(kind IN ('stop','resume')), trip_id uuid NOT NULL REFERENCES trip, reason stop_reason, starts_at_event uuid UNIQUE, start_kind event_kind GENERATED ALWAYS AS ('stop'::event_kind) STORED, FOREIGN KEY(id,kind) REFERENCES client_event(client_event_id,kind), UNIQUE(id,trip_id,kind), FOREIGN KEY(starts_at_event,trip_id,start_kind) REFERENCES stop_event(id,trip_id,kind), CHECK((kind='stop' AND reason IS NOT NULL AND starts_at_event IS NULL) OR (kind='resume' AND reason IS NULL AND starts_at_event IS NOT NULL)));
CREATE INDEX stops_by_trip ON stop_event(trip_id);
CREATE TABLE handover (id uuid PRIMARY KEY, kind event_kind GENERATED ALWAYS AS ('handover'::event_kind) STORED, load_id uuid NOT NULL REFERENCES crate_load, FOREIGN KEY(id,kind) REFERENCES client_event(client_event_id,kind));
CREATE TABLE gps_point (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, trip_id uuid NOT NULL REFERENCES trip, source text NOT NULL, source_key text NOT NULL, fix_at timestamptz NOT NULL, received_at timestamptz NOT NULL DEFAULT clock_timestamp(), valid boolean NOT NULL, latitude numeric CHECK(latitude BETWEEN -90 AND 90), longitude numeric CHECK(longitude BETWEEN -180 AND 180), UNIQUE(source,source_key), CHECK(NOT valid OR (latitude IS NOT NULL AND longitude IS NOT NULL)));
CREATE INDEX gps_trip_time ON gps_point(trip_id,fix_at DESC) WHERE valid;
CREATE TABLE alert (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), trip_id uuid NOT NULL REFERENCES trip, kind alert_kind NOT NULL, subject_key uuid NOT NULL, opened_at timestamptz NOT NULL, acknowledged_at timestamptz, closed_at timestamptz, evidence jsonb NOT NULL, verdict text CHECK(verdict IN ('valid','false','indeterminate')), CHECK(acknowledged_at IS NULL OR acknowledged_at>=opened_at), CHECK(closed_at IS NULL OR closed_at>=opened_at));
CREATE UNIQUE INDEX one_open_episode ON alert(trip_id,kind,subject_key) WHERE closed_at IS NULL;
CREATE TABLE audit_log (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(), actor_id uuid REFERENCES app_user, action text NOT NULL, entity_type text NOT NULL, entity_id uuid NOT NULL, detail jsonb NOT NULL);
CREATE INDEX audit_entity ON audit_log(entity_type,entity_id,recorded_at);
CREATE TABLE job (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, task text NOT NULL, event_id uuid NOT NULL REFERENCES client_event, available_at timestamptz NOT NULL DEFAULT now(), lease_until timestamptz, completed_at timestamptz, UNIQUE(task,event_id));
CREATE INDEX pending_jobs ON job(available_at) WHERE completed_at IS NULL;

CREATE FUNCTION forbid_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Append-only relation %',TG_TABLE_NAME; END $$;
DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['client_event','weigh_event','correction','correction_decision','crate_tare','weight_rule','load_rule','stop_event','handover','audit_log']
 LOOP
   EXECUTE format('CREATE TRIGGER immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION forbid_change()',n);
 END LOOP;
END $$;

CREATE VIEW effective_weigh AS
SELECT w.id,w.load_id,w.stage,e.actor_id, coalesce(a.revision,0) AS revision,
 coalesce(a.gross_kg,w.gross_kg) AS gross_kg,t.empty_kg,
 CASE WHEN w.verified OR a.revision IS NOT NULL THEN coalesce(a.gross_kg,w.gross_kg)-t.empty_kg END AS net_kg
FROM weigh_event w JOIN client_event e ON e.client_event_id=w.id
LEFT JOIN LATERAL (SELECT d.base_revision+1 AS revision,c.gross_kg,c.tare_id
 FROM correction_decision d JOIN correction c ON c.id=d.correction_id
 WHERE d.weigh_id=w.id AND d.approved ORDER BY d.base_revision DESC LIMIT 1) a ON true
LEFT JOIN crate_tare t ON t.id=coalesce(a.tare_id,w.tare_id);
CREATE VIEW load_difference AS
SELECT l.id AS load_id,p.net_kg AS pickup_kg,r.net_kg AS receipt_kg,
 r.net_kg-p.net_kg AS difference_kg,wr.id AS rule_id,wr.tolerance_kg,
 CASE WHEN p.actor_id<>r.actor_id THEN abs(r.net_kg-p.net_kg)>wr.tolerance_kg END AS exceeds_tolerance
FROM crate_load l LEFT JOIN effective_weigh p ON p.load_id=l.id AND p.stage='pickup'
LEFT JOIN effective_weigh r ON r.load_id=l.id AND r.stage='receipt'
LEFT JOIN load_rule lr ON lr.load_id=l.id LEFT JOIN weight_rule wr ON wr.id=lr.rule_id;

-- Trusted API supplies the authenticated actor and server-validated verification flag.
CREATE FUNCTION upload_weigh(p_id uuid,p_actor uuid,p_device uuid,p_time timestamptz,p_payload jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,dalumaga,pg_temp AS $$
DECLARE old_event dalumaga.client_event; w dalumaga.weigh_event;
BEGIN
 INSERT INTO client_event(client_event_id,kind,actor_id,device_id,occurred_at,payload)
 VALUES(p_id,'weigh',p_actor,p_device,p_time,p_payload) ON CONFLICT(client_event_id) DO NOTHING;
 IF NOT FOUND THEN
   SELECT * INTO STRICT old_event FROM client_event WHERE client_event_id=p_id;
   IF (old_event.kind,old_event.actor_id,old_event.device_id,old_event.occurred_at,old_event.payload)
      IS DISTINCT FROM ('weigh'::event_kind,p_actor,p_device,p_time,p_payload) THEN
     RAISE EXCEPTION USING ERRCODE='DM001',MESSAGE='Event ID conflict';
   END IF;
   RETURN p_id;
 END IF;
 INSERT INTO weigh_event(id,load_id,crate_id,stage,scale_id,gross_kg,tare_id,capture_method,verified)
 SELECT p_id,l.id,l.crate_id,(p_payload->>'stage')::weigh_stage,(p_payload->>'scale_id')::uuid,
 (p_payload->>'gross_kg')::numeric,(p_payload->>'tare_id')::uuid,p_payload->>'capture_method',(p_payload->>'verified')::boolean
 FROM crate_load l WHERE l.id=(p_payload->>'load_id')::uuid RETURNING * INTO STRICT w;
 INSERT INTO audit_log(actor_id,action,entity_type,entity_id,detail) VALUES(p_actor,'capture','weigh_event',p_id,jsonb_build_object('stage',w.stage));
 INSERT INTO job(task,event_id) VALUES('reconcile',p_id);
 RETURN p_id;
END $$;
REVOKE ALL ON ALL TABLES IN SCHEMA dalumaga FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA dalumaga FROM PUBLIC;
COMMIT;
