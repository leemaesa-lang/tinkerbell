CREATE TABLE `dashboardEvents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`eventId` varchar(64) NOT NULL,
	`eventType` varchar(96) NOT NULL,
	`clientUserId` varchar(128),
	`actorUserId` int,
	`payload` json NOT NULL,
	`status` enum('PENDING','SENT','FAILED','ACKNOWLEDGED') NOT NULL DEFAULT 'PENDING',
	`failureReason` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `dashboardEvents_id` PRIMARY KEY(`id`),
	CONSTRAINT `dashboardEvents_eventId_unique` UNIQUE(`eventId`)
);
--> statement-breakpoint
CREATE TABLE `membershipPayments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`eventId` varchar(64) NOT NULL,
	`clientUserId` varchar(128) NOT NULL,
	`displayName` varchar(120),
	`amount` int NOT NULL,
	`method` varchar(32) NOT NULL,
	`status` enum('PENDING','CONFIRMED','REJECTED') NOT NULL DEFAULT 'PENDING',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `membershipPayments_id` PRIMARY KEY(`id`),
	CONSTRAINT `membershipPayments_eventId_unique` UNIQUE(`eventId`)
);
--> statement-breakpoint
CREATE TABLE `partnerApplications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`eventId` varchar(64) NOT NULL,
	`clientUserId` varchar(128) NOT NULL,
	`applicantName` varchar(120) NOT NULL,
	`phone` varchar(40) NOT NULL,
	`bank` varchar(80) NOT NULL,
	`accountNumber` varchar(40) NOT NULL,
	`accountHolder` varchar(120) NOT NULL,
	`bankbookFileUrl` varchar(768),
	`status` enum('PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `partnerApplications_id` PRIMARY KEY(`id`),
	CONSTRAINT `partnerApplications_eventId_unique` UNIQUE(`eventId`)
);
--> statement-breakpoint
CREATE TABLE `partnerSettlements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clientUserId` varchar(128) NOT NULL,
	`month` varchar(7) NOT NULL,
	`retainedSubscribers` int NOT NULL DEFAULT 0,
	`cancelledSubscribers` int NOT NULL DEFAULT 0,
	`amount` int NOT NULL DEFAULT 0,
	`status` enum('PENDING','PAID','EXCLUDED') NOT NULL DEFAULT 'PENDING',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `partnerSettlements_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `dashboard_events_type_status_idx` ON `dashboardEvents` (`eventType`,`status`);--> statement-breakpoint
CREATE INDEX `dashboard_events_created_idx` ON `dashboardEvents` (`createdAt`);--> statement-breakpoint
CREATE INDEX `membership_payments_status_idx` ON `membershipPayments` (`status`);--> statement-breakpoint
CREATE INDEX `partner_applications_status_idx` ON `partnerApplications` (`status`);--> statement-breakpoint
CREATE INDEX `partner_settlements_user_month_idx` ON `partnerSettlements` (`clientUserId`,`month`);