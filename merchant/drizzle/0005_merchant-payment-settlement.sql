CREATE TABLE `business_payment_methods` (
	`id` int AUTO_INCREMENT NOT NULL,
	`publicId` varchar(36) NOT NULL,
	`accountId` int NOT NULL,
	`storeId` int NOT NULL,
	`methodKind` enum('card','refund_bank','partner_payout') NOT NULL,
	`provider` enum('portone','danal','bank') NOT NULL,
	`status` enum('pending','active','replaced','disabled') NOT NULL DEFAULT 'pending',
	`isDefault` boolean NOT NULL DEFAULT false,
	`displayLabel` varchar(120) NOT NULL,
	`lastFour` varchar(4),
	`encryptedDetails` text NOT NULL,
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `business_payment_methods_id` PRIMARY KEY(`id`),
	CONSTRAINT `business_payment_methods_publicId_unique` UNIQUE(`publicId`)
);
--> statement-breakpoint
CREATE TABLE `business_payment_transactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`publicId` varchar(36) NOT NULL,
	`accountId` int NOT NULL,
	`storeId` int NOT NULL,
	`actorUserId` int NOT NULL,
	`paymentMethodId` int,
	`provider` enum('portone','danal','bank') NOT NULL,
	`transactionType` enum('wallet_topup','refund','partner_payout') NOT NULL,
	`orderId` varchar(64) NOT NULL,
	`providerTransactionId` varchar(128),
	`amount` int NOT NULL,
	`status` enum('pending','succeeded','failed') NOT NULL DEFAULT 'pending',
	`confirmedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `business_payment_transactions_id` PRIMARY KEY(`id`),
	CONSTRAINT `business_payment_transactions_publicId_unique` UNIQUE(`publicId`),
	CONSTRAINT `business_payment_transactions_orderId_unique` UNIQUE(`orderId`),
	CONSTRAINT `business_payment_transactions_providerTransactionId_unique` UNIQUE(`providerTransactionId`)
);
--> statement-breakpoint
CREATE TABLE `business_wallet_balances` (
	`id` int AUTO_INCREMENT NOT NULL,
	`accountId` int NOT NULL,
	`storeId` int NOT NULL,
	`availableBalance` int NOT NULL DEFAULT 0,
	`lockedBalance` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `business_wallet_balances_id` PRIMARY KEY(`id`),
	CONSTRAINT `business_wallet_store_unique` UNIQUE(`storeId`)
);
--> statement-breakpoint
ALTER TABLE `business_payment_methods` ADD CONSTRAINT `business_payment_methods_accountId_business_accounts_id_fk` FOREIGN KEY (`accountId`) REFERENCES `business_accounts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_payment_methods` ADD CONSTRAINT `business_payment_methods_storeId_business_stores_id_fk` FOREIGN KEY (`storeId`) REFERENCES `business_stores`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_payment_methods` ADD CONSTRAINT `business_payment_methods_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_payment_transactions` ADD CONSTRAINT `business_payment_transactions_accountId_business_accounts_id_fk` FOREIGN KEY (`accountId`) REFERENCES `business_accounts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_payment_transactions` ADD CONSTRAINT `business_payment_transactions_storeId_business_stores_id_fk` FOREIGN KEY (`storeId`) REFERENCES `business_stores`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_payment_transactions` ADD CONSTRAINT `business_payment_transactions_actorUserId_users_id_fk` FOREIGN KEY (`actorUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_payment_transactions` ADD CONSTRAINT `business_payment_transactions_paymentMethodId_business_payment_methods_id_fk` FOREIGN KEY (`paymentMethodId`) REFERENCES `business_payment_methods`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_wallet_balances` ADD CONSTRAINT `business_wallet_balances_accountId_business_accounts_id_fk` FOREIGN KEY (`accountId`) REFERENCES `business_accounts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_wallet_balances` ADD CONSTRAINT `business_wallet_balances_storeId_business_stores_id_fk` FOREIGN KEY (`storeId`) REFERENCES `business_stores`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `business_payment_method_store_idx` ON `business_payment_methods` (`storeId`,`methodKind`,`status`);--> statement-breakpoint
CREATE INDEX `business_payment_method_account_idx` ON `business_payment_methods` (`accountId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `business_payment_tx_store_time_idx` ON `business_payment_transactions` (`storeId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `business_payment_tx_status_idx` ON `business_payment_transactions` (`status`,`createdAt`);