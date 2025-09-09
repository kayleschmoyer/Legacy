CREATE SCHEMA "app_internal";
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "app_internal"."access_level" AS ENUM('none', 'admin');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "app_internal"."users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" varchar(50),
	"email" varchar(100) NOT NULL,
	"password_hash" char(128),
	"access_level" "app_internal"."access_level" DEFAULT 'none',
	CONSTRAINT "users_username_uk" UNIQUE("username"),
	CONSTRAINT "users_email_uk" UNIQUE("email")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users__index" ON "app_internal"."users" USING btree ("username");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_email_index" ON "app_internal"."users" USING btree ("email");