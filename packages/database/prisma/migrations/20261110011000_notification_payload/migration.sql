-- Match explicit application NOTIFY payloads so PostgreSQL coalesces duplicate
-- notifications for the same insert within a transaction.
CREATE OR REPLACE FUNCTION notify_notification_insert() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('notification_created', format('{"userId":%s,"id":%s}', to_json(NEW."userId"), to_json(NEW.id)));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
