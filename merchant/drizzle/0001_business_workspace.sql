CREATE TABLE `business_bookings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`publicId` varchar(36) NOT NULL,
	`accountId` int NOT NULL,
	`storeId` int NOT NULL,
	`consumerUserId` int,
	`customerNameCiphertext` text NOT NULL,
	`phoneCiphertext` text,
	`contactConsentAt` timestamp,
	`contactNoticeVersion` varchar(40),
	`service` varchar(180) NOT NULL,
	`visitDate` date NOT NULL,
	`visitTime` varchar(5) NOT NULL,
	`endTime` varchar(5),
	`people` int NOT NULL DEFAULT 1,
	`memoCiphertext` text,
	`status` enum('pending','approved','visited','no_show','cancelled','declined') NOT NULL DEFAULT 'pending',
	`idempotencyKey` varchar(128) NOT NULL,
	`createdByUserId` int NOT NULL,
	`updatedByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `business_bookings_id` PRIMARY KEY(`id`),
	CONSTRAINT `business_bookings_publicId_unique` UNIQUE(`publicId`),
	CONSTRAINT `business_booking_idem_unique` UNIQUE(`storeId`,`idempotencyKey`)
);
--> statement-breakpoint
CREATE TABLE `business_account_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`accountId` int NOT NULL,
	`userId` int NOT NULL,
	`role` enum('owner','admin','operator','viewer') NOT NULL DEFAULT 'operator',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `business_account_members_id` PRIMARY KEY(`id`),
	CONSTRAINT `business_account_member_unique` UNIQUE(`accountId`,`userId`)
);
--> statement-breakpoint
CREATE TABLE `business_accounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`publicId` varchar(36) NOT NULL,
	`businessName` varchar(160) NOT NULL,
	`representativeNameCiphertext` text,
	`businessRegistrationCiphertext` text,
	`phoneCiphertext` text,
	`verificationStatus` enum('unverified','pending','verified','rejected') NOT NULL DEFAULT 'unverified',
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `business_accounts_id` PRIMARY KEY(`id`),
	CONSTRAINT `business_accounts_publicId_unique` UNIQUE(`publicId`)
);
--> statement-breakpoint
CREATE TABLE `business_audit_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`accountId` int NOT NULL,
	`storeId` int,
	`actorUserId` int NOT NULL,
	`action` varchar(100) NOT NULL,
	`entityType` varchar(80) NOT NULL,
	`entityId` varchar(36) NOT NULL,
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `business_audit_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `consumer_profiles` (
	`userId` int NOT NULL,
	`gender` enum('female','male','other','prefer_not_to_say') NOT NULL,
	`ageBand` enum('10s','20s','30s','40s','50plus') NOT NULL,
	`regionCode` varchar(10) NOT NULL,
	`latitude` varchar(32),
	`longitude` varchar(32),
	`phoneCiphertext` text,
	`phoneVerifiedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `consumer_profiles_userId` PRIMARY KEY(`userId`)
);
--> statement-breakpoint
CREATE TABLE `business_conversation_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`publicId` varchar(36) NOT NULL,
	`conversationId` int NOT NULL,
	`senderUserId` int NOT NULL,
	`senderKind` enum('business','consumer') NOT NULL,
	`bodyCiphertext` text NOT NULL,
	`idempotencyKey` varchar(128) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `business_conversation_messages_id` PRIMARY KEY(`id`),
	CONSTRAINT `business_conversation_messages_publicId_unique` UNIQUE(`publicId`),
	CONSTRAINT `business_message_idem_unique` UNIQUE(`conversationId`,`idempotencyKey`)
);
--> statement-breakpoint
CREATE TABLE `business_conversations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`publicId` varchar(36) NOT NULL,
	`accountId` int NOT NULL,
	`storeId` int NOT NULL,
	`bookingId` int,
	`trialApplicationId` int,
	`consumerUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `business_conversations_id` PRIMARY KEY(`id`),
	CONSTRAINT `business_conversations_publicId_unique` UNIQUE(`publicId`),
	CONSTRAINT `business_conversation_booking_unique` UNIQUE(`bookingId`),
	CONSTRAINT `business_conversation_trial_unique` UNIQUE(`trialApplicationId`)
);
--> statement-breakpoint
CREATE TABLE `business_coupon_claims` (
	`id` int AUTO_INCREMENT NOT NULL,
	`publicId` varchar(36) NOT NULL,
	`couponId` int NOT NULL,
	`storeId` int NOT NULL,
	`consumerUserId` int NOT NULL,
	`monthKey` varchar(7) NOT NULL,
	`status` enum('available','redeemed','expired','closed') NOT NULL DEFAULT 'available',
	`idempotencyKey` varchar(128) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `business_coupon_claims_id` PRIMARY KEY(`id`),
	CONSTRAINT `business_coupon_claims_publicId_unique` UNIQUE(`publicId`),
	CONSTRAINT `business_coupon_claim_monthly_unique` UNIQUE(`couponId`,`consumerUserId`,`monthKey`),
	CONSTRAINT `business_coupon_claim_idem_unique` UNIQUE(`consumerUserId`,`idempotencyKey`)
);
--> statement-breakpoint
CREATE TABLE `business_coupon_redemptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`publicId` varchar(36) NOT NULL,
	`couponId` int NOT NULL,
	`claimId` int NOT NULL,
	`storeId` int NOT NULL,
	`redeemedByUserId` int NOT NULL,
	`idempotencyKey` varchar(128) NOT NULL,
	`benefitAmount` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `business_coupon_redemptions_id` PRIMARY KEY(`id`),
	CONSTRAINT `business_coupon_redemptions_publicId_unique` UNIQUE(`publicId`),
	CONSTRAINT `business_coupon_redemptions_claimId_unique` UNIQUE(`claimId`),
	CONSTRAINT `business_coupon_redemption_idem_unique` UNIQUE(`storeId`,`idempotencyKey`)
);
--> statement-breakpoint
CREATE TABLE `business_coupons` (
	`id` int AUTO_INCREMENT NOT NULL,
	`publicId` varchar(36) NOT NULL,
	`accountId` int NOT NULL,
	`storeId` int NOT NULL,
	`title` varchar(160) NOT NULL,
	`description` text NOT NULL,
	`couponType` enum('special','discount','trial','hq_free','meetup') NOT NULL,
	`discountMode` enum('rate','amount','service') NOT NULL,
	`discountValue` int NOT NULL DEFAULT 0,
	`originalPrice` int NOT NULL DEFAULT 0,
	`serviceGift` varchar(255) NOT NULL DEFAULT '',
	`startsOn` date NOT NULL,
	`endsOn` date NOT NULL,
	`quantity` int NOT NULL,
	`distributionMultiplier` int NOT NULL DEFAULT 3,
	`issuedCount` int NOT NULL DEFAULT 0,
	`remaining` int NOT NULL,
	`targetRegions` json NOT NULL,
	`targetGender` enum('all','female','male') NOT NULL DEFAULT 'all',
	`targetAges` json NOT NULL,
	`radiusKm` int NOT NULL DEFAULT 5,
	`mediaAssetPublicIds` json NOT NULL,
	`status` enum('draft','active','paused','ended','closed') NOT NULL DEFAULT 'draft',
	`createdByUserId` int NOT NULL,
	`updatedByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `business_coupons_id` PRIMARY KEY(`id`),
	CONSTRAINT `business_coupons_publicId_unique` UNIQUE(`publicId`)
);
--> statement-breakpoint
CREATE TABLE `business_idempotency_keys` (
	`id` int AUTO_INCREMENT NOT NULL,
	`actorUserId` int NOT NULL,
	`scope` varchar(80) NOT NULL,
	`key` varchar(128) NOT NULL,
	`requestHash` varchar(64) NOT NULL,
	`resourceType` varchar(80) NOT NULL,
	`resourceId` varchar(36) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `business_idempotency_keys_id` PRIMARY KEY(`id`),
	CONSTRAINT `business_idempotency_actor_scope_key_unique` UNIQUE(`actorUserId`,`scope`,`key`)
);
--> statement-breakpoint
CREATE TABLE `business_store_assets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`publicId` varchar(36) NOT NULL,
	`accountId` int NOT NULL,
	`storeId` int,
	`assetType` enum('business_certificate','store_photo','coupon_image','coupon_video') NOT NULL,
	`storageKey` varchar(512) NOT NULL,
	`originalName` varchar(255) NOT NULL,
	`mimeType` varchar(120) NOT NULL,
	`byteSize` int NOT NULL,
	`uploadedByUserId` int NOT NULL,
	`isPrimary` boolean NOT NULL DEFAULT false,
	`displayOrder` int NOT NULL DEFAULT 0,
	`deletedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `business_store_assets_id` PRIMARY KEY(`id`),
	CONSTRAINT `business_store_assets_publicId_unique` UNIQUE(`publicId`),
	CONSTRAINT `business_store_assets_storageKey_unique` UNIQUE(`storageKey`)
);
--> statement-breakpoint
CREATE TABLE `business_store_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`storeId` int NOT NULL,
	`userId` int NOT NULL,
	`role` enum('manager','operator','viewer') NOT NULL DEFAULT 'operator',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `business_store_members_id` PRIMARY KEY(`id`),
	CONSTRAINT `business_store_member_unique` UNIQUE(`storeId`,`userId`)
);
--> statement-breakpoint
CREATE TABLE `business_store_memberships` (
	`id` int AUTO_INCREMENT NOT NULL,
	`storeId` int NOT NULL,
	`plan` enum('meetup_monthly_presence') NOT NULL DEFAULT 'meetup_monthly_presence',
	`status` enum('inactive','pending','active','cancelled','expired') NOT NULL DEFAULT 'inactive',
	`startsAt` timestamp,
	`endsAt` timestamp,
	`activatedByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `business_store_memberships_id` PRIMARY KEY(`id`),
	CONSTRAINT `business_store_memberships_storeId_unique` UNIQUE(`storeId`)
);
--> statement-breakpoint
CREATE TABLE `business_store_pin_attempts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`storeId` int NOT NULL,
	`actorUserId` int NOT NULL,
	`succeeded` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `business_store_pin_attempts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `business_store_pins` (
	`id` int AUTO_INCREMENT NOT NULL,
	`storeId` int NOT NULL,
	`pinHash` varchar(255) NOT NULL,
	`updatedByUserId` int NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `business_store_pins_id` PRIMARY KEY(`id`),
	CONSTRAINT `business_store_pins_storeId_unique` UNIQUE(`storeId`)
);
--> statement-breakpoint
CREATE TABLE `business_stores` (
	`id` int AUTO_INCREMENT NOT NULL,
	`publicId` varchar(36) NOT NULL,
	`accountId` int NOT NULL,
	`name` varchar(160) NOT NULL,
	`category` varchar(80) NOT NULL,
	`businessType` varchar(120) NOT NULL,
	`businessRegistrationCiphertext` text,
	`certificateAssetId` int,
	`phoneCiphertext` text,
	`province` varchar(80) NOT NULL,
	`district` varchar(80) NOT NULL,
	`dong` varchar(100) NOT NULL,
	`dongCode` varchar(20) NOT NULL,
	`roadAddress` varchar(300) NOT NULL,
	`detailAddressCiphertext` text,
	`postalCode` varchar(12),
	`latitude` varchar(32),
	`longitude` varchar(32),
	`naverMapUrl` varchar(1000),
	`googleMapUrl` varchar(1000),
	`searchRadiusKm` int NOT NULL DEFAULT 5,
	`operatingStatus` enum('open','break','closed') NOT NULL DEFAULT 'open',
	`isActive` boolean NOT NULL DEFAULT true,
	`createdByUserId` int NOT NULL,
	`updatedByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `business_stores_id` PRIMARY KEY(`id`),
	CONSTRAINT `business_stores_publicId_unique` UNIQUE(`publicId`)
);
--> statement-breakpoint
CREATE TABLE `business_trial_applications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`publicId` varchar(36) NOT NULL,
	`accountId` int NOT NULL,
	`storeId` int NOT NULL,
	`campaignId` int NOT NULL,
	`consumerUserId` int NOT NULL,
	`nickname` varchar(80) NOT NULL,
	`phoneCiphertext` text,
	`contactConsentAt` timestamp,
	`contactNoticeVersion` varchar(40),
	`preferredDate` date,
	`preferredTime` varchar(5),
	`preferredEndTime` varchar(5),
	`reviewChannels` json NOT NULL,
	`motivationCiphertext` text,
	`status` enum('pending','selected','rejected','visited','closed') NOT NULL DEFAULT 'pending',
	`idempotencyKey` varchar(128) NOT NULL,
	`reviewedByUserId` int,
	`reviewedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `business_trial_applications_id` PRIMARY KEY(`id`),
	CONSTRAINT `business_trial_applications_publicId_unique` UNIQUE(`publicId`),
	CONSTRAINT `business_trial_application_unique` UNIQUE(`campaignId`,`consumerUserId`),
	CONSTRAINT `business_trial_application_idem_unique` UNIQUE(`consumerUserId`,`idempotencyKey`)
);
--> statement-breakpoint
CREATE TABLE `business_trial_campaigns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`publicId` varchar(36) NOT NULL,
	`accountId` int NOT NULL,
	`storeId` int NOT NULL,
	`couponId` int,
	`title` varchar(160) NOT NULL,
	`recruitmentGoal` int NOT NULL,
	`selectedCount` int NOT NULL DEFAULT 0,
	`requiredGender` enum('all','female','male') NOT NULL DEFAULT 'all',
	`requiredAgeBands` json NOT NULL,
	`targetRegionCodes` json NOT NULL,
	`reviewChannels` json NOT NULL,
	`status` enum('draft','open','paused','closed') NOT NULL DEFAULT 'draft',
	`applicationEndsOn` date,
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `business_trial_campaigns_id` PRIMARY KEY(`id`),
	CONSTRAINT `business_trial_campaigns_publicId_unique` UNIQUE(`publicId`)
);
--> statement-breakpoint
ALTER TABLE `business_bookings` ADD CONSTRAINT `business_bookings_accountId_business_accounts_id_fk` FOREIGN KEY (`accountId`) REFERENCES `business_accounts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_bookings` ADD CONSTRAINT `business_bookings_storeId_business_stores_id_fk` FOREIGN KEY (`storeId`) REFERENCES `business_stores`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_bookings` ADD CONSTRAINT `business_bookings_consumerUserId_users_id_fk` FOREIGN KEY (`consumerUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_bookings` ADD CONSTRAINT `business_bookings_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_bookings` ADD CONSTRAINT `business_bookings_updatedByUserId_users_id_fk` FOREIGN KEY (`updatedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_account_members` ADD CONSTRAINT `business_account_members_accountId_business_accounts_id_fk` FOREIGN KEY (`accountId`) REFERENCES `business_accounts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_account_members` ADD CONSTRAINT `business_account_members_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_accounts` ADD CONSTRAINT `business_accounts_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_audit_events` ADD CONSTRAINT `business_audit_events_accountId_business_accounts_id_fk` FOREIGN KEY (`accountId`) REFERENCES `business_accounts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_audit_events` ADD CONSTRAINT `business_audit_events_storeId_business_stores_id_fk` FOREIGN KEY (`storeId`) REFERENCES `business_stores`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_audit_events` ADD CONSTRAINT `business_audit_events_actorUserId_users_id_fk` FOREIGN KEY (`actorUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `consumer_profiles` ADD CONSTRAINT `consumer_profiles_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_conversation_messages` ADD CONSTRAINT `bcmsg_conversation_fk` FOREIGN KEY (`conversationId`) REFERENCES `business_conversations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_conversation_messages` ADD CONSTRAINT `business_conversation_messages_senderUserId_users_id_fk` FOREIGN KEY (`senderUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_conversations` ADD CONSTRAINT `business_conversations_accountId_business_accounts_id_fk` FOREIGN KEY (`accountId`) REFERENCES `business_accounts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_conversations` ADD CONSTRAINT `business_conversations_storeId_business_stores_id_fk` FOREIGN KEY (`storeId`) REFERENCES `business_stores`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_conversations` ADD CONSTRAINT `business_conversations_bookingId_business_bookings_id_fk` FOREIGN KEY (`bookingId`) REFERENCES `business_bookings`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_conversations` ADD CONSTRAINT `bconv_trial_app_fk` FOREIGN KEY (`trialApplicationId`) REFERENCES `business_trial_applications`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_conversations` ADD CONSTRAINT `business_conversations_consumerUserId_users_id_fk` FOREIGN KEY (`consumerUserId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_coupon_claims` ADD CONSTRAINT `business_coupon_claims_couponId_business_coupons_id_fk` FOREIGN KEY (`couponId`) REFERENCES `business_coupons`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_coupon_claims` ADD CONSTRAINT `business_coupon_claims_storeId_business_stores_id_fk` FOREIGN KEY (`storeId`) REFERENCES `business_stores`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_coupon_claims` ADD CONSTRAINT `business_coupon_claims_consumerUserId_users_id_fk` FOREIGN KEY (`consumerUserId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_coupon_redemptions` ADD CONSTRAINT `business_coupon_redemptions_couponId_business_coupons_id_fk` FOREIGN KEY (`couponId`) REFERENCES `business_coupons`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_coupon_redemptions` ADD CONSTRAINT `bcred_claim_fk` FOREIGN KEY (`claimId`) REFERENCES `business_coupon_claims`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_coupon_redemptions` ADD CONSTRAINT `business_coupon_redemptions_storeId_business_stores_id_fk` FOREIGN KEY (`storeId`) REFERENCES `business_stores`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_coupon_redemptions` ADD CONSTRAINT `business_coupon_redemptions_redeemedByUserId_users_id_fk` FOREIGN KEY (`redeemedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_coupons` ADD CONSTRAINT `business_coupons_accountId_business_accounts_id_fk` FOREIGN KEY (`accountId`) REFERENCES `business_accounts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_coupons` ADD CONSTRAINT `business_coupons_storeId_business_stores_id_fk` FOREIGN KEY (`storeId`) REFERENCES `business_stores`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_coupons` ADD CONSTRAINT `business_coupons_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_coupons` ADD CONSTRAINT `business_coupons_updatedByUserId_users_id_fk` FOREIGN KEY (`updatedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_idempotency_keys` ADD CONSTRAINT `business_idempotency_keys_actorUserId_users_id_fk` FOREIGN KEY (`actorUserId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_store_assets` ADD CONSTRAINT `business_store_assets_accountId_business_accounts_id_fk` FOREIGN KEY (`accountId`) REFERENCES `business_accounts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_store_assets` ADD CONSTRAINT `business_store_assets_storeId_business_stores_id_fk` FOREIGN KEY (`storeId`) REFERENCES `business_stores`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_store_assets` ADD CONSTRAINT `business_store_assets_uploadedByUserId_users_id_fk` FOREIGN KEY (`uploadedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_store_members` ADD CONSTRAINT `business_store_members_storeId_business_stores_id_fk` FOREIGN KEY (`storeId`) REFERENCES `business_stores`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_store_members` ADD CONSTRAINT `business_store_members_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_store_memberships` ADD CONSTRAINT `business_store_memberships_storeId_business_stores_id_fk` FOREIGN KEY (`storeId`) REFERENCES `business_stores`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_store_memberships` ADD CONSTRAINT `business_store_memberships_activatedByUserId_users_id_fk` FOREIGN KEY (`activatedByUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_store_pin_attempts` ADD CONSTRAINT `business_store_pin_attempts_storeId_business_stores_id_fk` FOREIGN KEY (`storeId`) REFERENCES `business_stores`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_store_pin_attempts` ADD CONSTRAINT `business_store_pin_attempts_actorUserId_users_id_fk` FOREIGN KEY (`actorUserId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_store_pins` ADD CONSTRAINT `business_store_pins_storeId_business_stores_id_fk` FOREIGN KEY (`storeId`) REFERENCES `business_stores`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_store_pins` ADD CONSTRAINT `business_store_pins_updatedByUserId_users_id_fk` FOREIGN KEY (`updatedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_stores` ADD CONSTRAINT `business_stores_accountId_business_accounts_id_fk` FOREIGN KEY (`accountId`) REFERENCES `business_accounts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_stores` ADD CONSTRAINT `business_stores_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_stores` ADD CONSTRAINT `business_stores_updatedByUserId_users_id_fk` FOREIGN KEY (`updatedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_trial_applications` ADD CONSTRAINT `btrial_account_fk` FOREIGN KEY (`accountId`) REFERENCES `business_accounts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_trial_applications` ADD CONSTRAINT `business_trial_applications_storeId_business_stores_id_fk` FOREIGN KEY (`storeId`) REFERENCES `business_stores`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_trial_applications` ADD CONSTRAINT `btrial_campaign_fk` FOREIGN KEY (`campaignId`) REFERENCES `business_trial_campaigns`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_trial_applications` ADD CONSTRAINT `business_trial_applications_consumerUserId_users_id_fk` FOREIGN KEY (`consumerUserId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_trial_applications` ADD CONSTRAINT `business_trial_applications_reviewedByUserId_users_id_fk` FOREIGN KEY (`reviewedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_trial_campaigns` ADD CONSTRAINT `business_trial_campaigns_accountId_business_accounts_id_fk` FOREIGN KEY (`accountId`) REFERENCES `business_accounts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_trial_campaigns` ADD CONSTRAINT `business_trial_campaigns_storeId_business_stores_id_fk` FOREIGN KEY (`storeId`) REFERENCES `business_stores`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_trial_campaigns` ADD CONSTRAINT `business_trial_campaigns_couponId_business_coupons_id_fk` FOREIGN KEY (`couponId`) REFERENCES `business_coupons`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `business_trial_campaigns` ADD CONSTRAINT `business_trial_campaigns_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `business_booking_timeline_idx` ON `business_bookings` (`storeId`,`visitDate`,`visitTime`,`status`);--> statement-breakpoint
CREATE INDEX `business_account_member_user_idx` ON `business_account_members` (`userId`);--> statement-breakpoint
CREATE INDEX `business_accounts_creator_idx` ON `business_accounts` (`createdByUserId`);--> statement-breakpoint
CREATE INDEX `business_audit_scope_idx` ON `business_audit_events` (`accountId`,`storeId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `consumer_profile_region_idx` ON `consumer_profiles` (`regionCode`);--> statement-breakpoint
CREATE INDEX `business_message_timeline_idx` ON `business_conversation_messages` (`conversationId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `business_conversation_scope_idx` ON `business_conversations` (`accountId`,`storeId`);--> statement-breakpoint
CREATE INDEX `business_coupon_claim_store_idx` ON `business_coupon_claims` (`storeId`,`status`);--> statement-breakpoint
CREATE INDEX `business_coupon_redemption_history_idx` ON `business_coupon_redemptions` (`storeId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `business_coupons_scope_idx` ON `business_coupons` (`accountId`,`storeId`,`status`);--> statement-breakpoint
CREATE INDEX `business_coupons_period_idx` ON `business_coupons` (`startsOn`,`endsOn`);--> statement-breakpoint
CREATE INDEX `business_idempotency_created_idx` ON `business_idempotency_keys` (`createdAt`);--> statement-breakpoint
CREATE INDEX `business_store_assets_scope_idx` ON `business_store_assets` (`accountId`,`storeId`);--> statement-breakpoint
CREATE INDEX `business_store_member_user_idx` ON `business_store_members` (`userId`);--> statement-breakpoint
CREATE INDEX `business_store_membership_status_idx` ON `business_store_memberships` (`status`,`endsAt`);--> statement-breakpoint
CREATE INDEX `business_store_pin_attempt_actor_idx` ON `business_store_pin_attempts` (`storeId`,`actorUserId`,`succeeded`,`createdAt`);--> statement-breakpoint
CREATE INDEX `business_store_pin_attempt_store_idx` ON `business_store_pin_attempts` (`storeId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `business_stores_account_idx` ON `business_stores` (`accountId`);--> statement-breakpoint
CREATE INDEX `business_stores_region_idx` ON `business_stores` (`province`,`district`,`dongCode`);--> statement-breakpoint
CREATE INDEX `business_stores_active_idx` ON `business_stores` (`isActive`);--> statement-breakpoint
CREATE INDEX `business_trial_application_store_idx` ON `business_trial_applications` (`storeId`,`status`,`createdAt`);--> statement-breakpoint
CREATE INDEX `business_trial_campaign_scope_idx` ON `business_trial_campaigns` (`accountId`,`storeId`,`status`);