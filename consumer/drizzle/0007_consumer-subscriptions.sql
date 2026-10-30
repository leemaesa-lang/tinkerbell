CREATE TABLE `consumerSubscriptions` (
	`userId` varchar(128) NOT NULL,
	`plan` varchar(64) NOT NULL DEFAULT 'MONTHLY_10000',
	`status` enum('PENDING','ACTIVE','CANCELED','EXPIRED') NOT NULL DEFAULT 'PENDING',
	`method` varchar(32) NOT NULL,
	`currentPeriodEnd` timestamp,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `consumerSubscriptions_userId` PRIMARY KEY(`userId`)
);
