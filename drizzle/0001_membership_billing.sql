CREATE TABLE `membership_orders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`subscriptionId` int NOT NULL,
	`userOpenId` varchar(64) NOT NULL,
	`paymentEnvironment` enum('test','live') NOT NULL,
	`orderId` varchar(50) NOT NULL,
	`cycleKey` varchar(40) NOT NULL,
	`orderType` enum('INITIAL','RENEWAL') NOT NULL,
	`status` enum('PENDING','PROCESSING','SUCCEEDED','FAILED','UNKNOWN') NOT NULL DEFAULT 'PENDING',
	`amount` int NOT NULL,
	`transactionId` varchar(64),
	`returnOrigin` varchar(512),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `membership_orders_id` PRIMARY KEY(`id`),
	CONSTRAINT `membership_order_order_id_uq` UNIQUE(`orderId`),
	CONSTRAINT `membership_order_cycle_uq` UNIQUE(`subscriptionId`,`cycleKey`)
);
--> statement-breakpoint
CREATE TABLE `membership_schedules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`paymentEnvironment` enum('test','live') NOT NULL,
	`taskUid` varchar(128) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `membership_schedules_id` PRIMARY KEY(`id`),
	CONSTRAINT `membership_schedule_environment_uq` UNIQUE(`paymentEnvironment`),
	CONSTRAINT `membership_schedule_task_uid_uq` UNIQUE(`taskUid`)
);
--> statement-breakpoint
CREATE TABLE `membership_subscriptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userOpenId` varchar(64) NOT NULL,
	`paymentEnvironment` enum('test','live') NOT NULL,
	`status` enum('PENDING','INCOMPLETE','ACTIVE','PAST_DUE','CANCELED') NOT NULL DEFAULT 'PENDING',
	`periodStart` timestamp,
	`periodEnd` timestamp,
	`nextBillingAt` timestamp,
	`cancelAtPeriodEnd` boolean NOT NULL DEFAULT false,
	`billingKeyCiphertext` text,
	`billingKeyIv` varchar(32),
	`billingKeyTag` varchar(32),
	`cardName` varchar(128),
	`maskedCard` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `membership_subscriptions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `membership_order_pending_idx` ON `membership_orders` (`paymentEnvironment`,`status`,`createdAt`);--> statement-breakpoint
CREATE INDEX `membership_sub_user_env_idx` ON `membership_subscriptions` (`userOpenId`,`paymentEnvironment`);--> statement-breakpoint
CREATE INDEX `membership_sub_due_idx` ON `membership_subscriptions` (`paymentEnvironment`,`status`,`cancelAtPeriodEnd`,`nextBillingAt`);