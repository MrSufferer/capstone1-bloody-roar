CREATE FUNCTION notify_notification_insert() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('notification_created', json_build_object('userId', NEW."userId", 'id', NEW.id)::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER notification_inserted
AFTER INSERT ON "notifications"
FOR EACH ROW EXECUTE FUNCTION notify_notification_insert();
