CREATE TABLE `events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`identity` text NOT NULL,
	`triggered_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `triggers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`trigger_identity` text NOT NULL,
	`direction` text NOT NULL,
	`threshold` integer NOT NULL
);

--> statement-breakpoint
CREATE UNIQUE INDEX `triggers_trigger_identity_unique` ON `triggers` (`trigger_identity`);