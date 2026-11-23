CREATE TABLE `bank_questions` (
	`certificate_id` text NOT NULL,
	`bank_id` text NOT NULL,
	`bank_version` text NOT NULL,
	`question_id` text NOT NULL,
	`position` integer NOT NULL,
	`body` text NOT NULL,
	PRIMARY KEY(`certificate_id`, `bank_id`, `bank_version`, `question_id`),
	FOREIGN KEY (`certificate_id`,`bank_id`,`bank_version`) REFERENCES `question_bank_versions`(`certificate_id`,`bank_id`,`bank_version`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bank_questions_position` ON `bank_questions` (`certificate_id`,`bank_id`,`bank_version`,`position`);--> statement-breakpoint
CREATE TABLE `bank_solutions` (
	`certificate_id` text NOT NULL,
	`bank_id` text NOT NULL,
	`bank_version` text NOT NULL,
	`question_id` text NOT NULL,
	`position` integer NOT NULL,
	`body` text NOT NULL,
	PRIMARY KEY(`certificate_id`, `bank_id`, `bank_version`, `question_id`),
	FOREIGN KEY (`certificate_id`,`bank_id`,`bank_version`,`question_id`) REFERENCES `bank_questions`(`certificate_id`,`bank_id`,`bank_version`,`question_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bank_solutions_position` ON `bank_solutions` (`certificate_id`,`bank_id`,`bank_version`,`position`);--> statement-breakpoint
CREATE TABLE `question_bank_versions` (
	`certificate_id` text NOT NULL,
	`bank_id` text NOT NULL,
	`bank_version` text NOT NULL,
	`checksum` text NOT NULL,
	`manifest` text NOT NULL,
	`question_count` integer NOT NULL,
	`created_at` text NOT NULL,
	`draft_revision` integer DEFAULT 0 NOT NULL,
	`verified_at` text,
	`published_at` text,
	`exam_ready` integer DEFAULT false NOT NULL,
	PRIMARY KEY(`certificate_id`, `bank_id`, `bank_version`),
	FOREIGN KEY (`certificate_id`,`bank_id`) REFERENCES `question_banks`(`certificate_id`,`bank_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `question_banks` (
	`certificate_id` text NOT NULL,
	`bank_id` text NOT NULL,
	`active_version` text,
	PRIMARY KEY(`certificate_id`, `bank_id`)
);
