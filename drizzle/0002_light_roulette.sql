PRAGMA defer_foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_learning_records` (
	`user_id` text NOT NULL,
	`certificate_id` text NOT NULL,
	`generation` text DEFAULT '' NOT NULL,
	`kind` text NOT NULL,
	`key` text NOT NULL,
	`body` text NOT NULL,
	PRIMARY KEY(`user_id`, `certificate_id`, `generation`, `kind`, `key`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_learning_records`("user_id", "certificate_id", "generation", "kind", "key", "body") SELECT old.user_id, old.certificate_id, COALESCE((SELECT operation_id FROM learning_scopes WHERE user_id=old.user_id AND certificate_id=old.certificate_id), ''), old.kind, old.key, old.body FROM learning_records AS old;--> statement-breakpoint
DROP TABLE `learning_records`;--> statement-breakpoint
ALTER TABLE `__new_learning_records` RENAME TO `learning_records`;--> statement-breakpoint
PRAGMA defer_foreign_keys=OFF;
