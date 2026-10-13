CREATE TRIGGER users_last_admin_update BEFORE UPDATE OF role, deleted_at ON users
WHEN OLD.role = 'admin' AND OLD.deleted_at IS NULL
 AND (NEW.role <> 'admin' OR NEW.deleted_at IS NOT NULL)
 AND NOT EXISTS (SELECT 1 FROM users WHERE id <> OLD.id AND role = 'admin' AND deleted_at IS NULL)
BEGIN
 SELECT RAISE(ABORT, 'last_admin');
END;
--> statement-breakpoint
CREATE TRIGGER users_last_admin_delete BEFORE DELETE ON users
WHEN OLD.role = 'admin' AND OLD.deleted_at IS NULL
 AND NOT EXISTS (SELECT 1 FROM users WHERE id <> OLD.id AND role = 'admin' AND deleted_at IS NULL)
BEGIN
 SELECT RAISE(ABORT, 'last_admin');
END;
