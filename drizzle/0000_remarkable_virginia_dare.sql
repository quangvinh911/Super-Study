CREATE TABLE `auth_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`reset_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `auth_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`refresh_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `learning_records` (
	`user_id` text NOT NULL,
	`certificate_id` text NOT NULL,
	`kind` text NOT NULL,
	`key` text NOT NULL,
	`body` text NOT NULL,
	PRIMARY KEY(`user_id`, `certificate_id`, `kind`, `key`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `learning_scopes` (
	`user_id` text NOT NULL,
	`certificate_id` text NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`operation_id` text DEFAULT '' NOT NULL,
	PRIMARY KEY(`user_id`, `certificate_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`username_key` text NOT NULL,
	`email` text,
	`role` text NOT NULL,
	`password_hash` text NOT NULL,
	`deleted_at` text,
	`token_version` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_key_unique` ON `users` (`username_key`);