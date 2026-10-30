CREATE TABLE `business_support_tickets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`publicId` varchar(36) NOT NULL,
	`accountId` int NOT NULL,
	`storeId` int,
	`createdByUserId` int NOT NULL,
	`category` enum('deposit','pin','address','coupon','other') NOT NULL,
	`subject` varchar(160) NOT NULL,
	`bodyCiphertext` text NOT NULL,
	`status` enum('open','in_progress','resolved') NOT NULL DEFAULT 'open',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `business_support_tickets_id` PRIMARY KEY(`id`),
	CONSTRAINT `business_support_tickets_publicId_unique` UNIQUE(`publicId`)
);
--> statement-breakpoint
ALTER TABLE `business_support_tickets` ADD CONSTRAINT `bsup_account_fk` FOREIGN KEY (`accountId`) REFERENCES `business_accounts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_support_tickets` ADD CONSTRAINT `bsup_store_fk` FOREIGN KEY (`storeId`) REFERENCES `business_stores`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_support_tickets` ADD CONSTRAINT `bsup_creator_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `business_support_account_time_idx` ON `business_support_tickets` (`accountId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `business_support_author_time_idx` ON `business_support_tickets` (`createdByUserId`,`createdAt`);