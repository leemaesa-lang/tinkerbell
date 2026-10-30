CREATE TABLE `consumerCampaignApplications` (
	`id` varchar(128) NOT NULL,
	`userId` varchar(128) NOT NULL,
	`campaignId` varchar(96) NOT NULL,
	`merchantName` varchar(160) NOT NULL,
	`status` enum('PENDING','SELECTED','REJECTED','COMPLETED') NOT NULL DEFAULT 'PENDING',
	`visitDate` varchar(32),
	`visitTime` varchar(32),
	`channels` json NOT NULL,
	`promise` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `consumerCampaignApplications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `consumerCoupons` (
	`couponId` varchar(96) NOT NULL,
	`merchantId` varchar(96) NOT NULL,
	`merchantName` varchar(160) NOT NULL,
	`branchName` varchar(160) NOT NULL,
	`address` varchar(320) NOT NULL,
	`phone` varchar(40) NOT NULL,
	`businessHours` json NOT NULL,
	`closedDay` varchar(120) NOT NULL,
	`title` varchar(240) NOT NULL,
	`originalPrice` int NOT NULL,
	`discountPrice` int NOT NULL,
	`discountRate` int NOT NULL,
	`usageType` enum('VISIT','PICKUP','RESERVATION') NOT NULL,
	`targetRadiusKm` int NOT NULL,
	`targetDongs` json NOT NULL,
	`remainingQuantity` int NOT NULL,
	`status` enum('ACTIVE','PAUSED','SOLD_OUT','EXPIRED') NOT NULL DEFAULT 'ACTIVE',
	`memberOnly` boolean NOT NULL DEFAULT false,
	`pin` varchar(32) NOT NULL,
	`imageUrl` varchar(768),
	`mediaUrl` varchar(768),
	`videoUrl` varchar(768),
	`mediaType` varchar(80),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `consumerCoupons_couponId` PRIMARY KEY(`couponId`)
);
--> statement-breakpoint
CREATE TABLE `consumerOrders` (
	`id` varchar(128) NOT NULL,
	`userId` varchar(128) NOT NULL,
	`userCouponId` varchar(128) NOT NULL,
	`usageType` enum('VISIT','PICKUP','RESERVATION') NOT NULL,
	`status` enum('PENDING','CONFIRMED','REJECTED','COMPLETED') NOT NULL DEFAULT 'PENDING',
	`requestedAt` timestamp NOT NULL,
	CONSTRAINT `consumerOrders_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `consumerReservations` (
	`id` varchar(128) NOT NULL,
	`userId` varchar(128) NOT NULL,
	`userCouponId` varchar(128) NOT NULL,
	`usageType` enum('RESERVATION') NOT NULL,
	`status` enum('PENDING','CONFIRMED','REJECTED','COMPLETED') NOT NULL DEFAULT 'PENDING',
	`requestedAt` timestamp NOT NULL,
	`visitDate` varchar(32) NOT NULL,
	`visitTime` varchar(32) NOT NULL,
	`partySize` int NOT NULL,
	CONSTRAINT `consumerReservations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `consumerUserCoupons` (
	`id` varchar(128) NOT NULL,
	`userId` varchar(128) NOT NULL,
	`couponId` varchar(96) NOT NULL,
	`merchantId` varchar(96) NOT NULL,
	`status` enum('ACTIVE','USED','EXPIRED','RETURNED') NOT NULL DEFAULT 'ACTIVE',
	`visitDate` varchar(32),
	`pickupTime` varchar(32),
	`partySize` int,
	`pin` varchar(32) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `consumerUserCoupons_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `consumer_campaign_apps_user_idx` ON `consumerCampaignApplications` (`userId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `consumer_coupons_status_idx` ON `consumerCoupons` (`status`);--> statement-breakpoint
CREATE INDEX `consumer_coupons_merchant_idx` ON `consumerCoupons` (`merchantId`);--> statement-breakpoint
CREATE INDEX `consumer_orders_user_idx` ON `consumerOrders` (`userId`,`requestedAt`);--> statement-breakpoint
CREATE INDEX `consumer_reservations_user_idx` ON `consumerReservations` (`userId`,`requestedAt`);--> statement-breakpoint
CREATE INDEX `consumer_user_coupons_user_status_idx` ON `consumerUserCoupons` (`userId`,`status`);--> statement-breakpoint
CREATE INDEX `consumer_user_coupons_coupon_idx` ON `consumerUserCoupons` (`couponId`);