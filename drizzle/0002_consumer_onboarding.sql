CREATE TABLE `consumer_identity_challenges` (
	`identityVerificationId` varchar(128) NOT NULL,
	`challengeTokenHash` varchar(64) NOT NULL,
	`consumerOrigin` varchar(512) NOT NULL,
	`status` enum('PENDING','VERIFIED','FAILED','EXPIRED') NOT NULL DEFAULT 'PENDING',
	`completedOpenId` varchar(64),
	`failureCode` varchar(64),
	`expiresAt` timestamp NOT NULL,
	`usedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `consumer_identity_challenges_identityVerificationId` PRIMARY KEY(`identityVerificationId`),
	CONSTRAINT `consumer_identity_challenge_token_uq` UNIQUE(`challengeTokenHash`)
);
--> statement-breakpoint
CREATE TABLE `consumer_membership_consents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userOpenId` varchar(64) NOT NULL,
	`decision` enum('ACCEPTED','DECLINED','REVOKED') NOT NULL,
	`policyVersion` varchar(32) NOT NULL,
	`amount` int NOT NULL,
	`currency` varchar(3) NOT NULL DEFAULT 'KRW',
	`billingInterval` varchar(16) NOT NULL DEFAULT 'MONTHLY',
	`autoRenewal` boolean NOT NULL DEFAULT true,
	`source` enum('PROFILE_SETUP','MEMBERSHIP_SETTINGS') NOT NULL,
	`decidedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `consumer_membership_consents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `consumer_phone_identities` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userOpenId` varchar(64) NOT NULL,
	`diHash` varchar(64) NOT NULL,
	`phoneHash` varchar(64) NOT NULL,
	`phoneCiphertext` text NOT NULL,
	`phoneIv` varchar(32) NOT NULL,
	`phoneTag` varchar(32) NOT NULL,
	`providerVerificationId` varchar(128) NOT NULL,
	`providerChannelId` varchar(128) NOT NULL,
	`gender` enum('MALE','FEMALE','OTHER') NOT NULL,
	`ageBand` enum('UNDER_14','14_18','19_29','30_39','40_49','50_59','60_PLUS') NOT NULL,
	`verifiedAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `consumer_phone_identities_id` PRIMARY KEY(`id`),
	CONSTRAINT `consumer_phone_user_uq` UNIQUE(`userOpenId`),
	CONSTRAINT `consumer_phone_di_uq` UNIQUE(`diHash`),
	CONSTRAINT `consumer_phone_verification_uq` UNIQUE(`providerVerificationId`)
);
--> statement-breakpoint
CREATE TABLE `consumer_profiles` (
	`userOpenId` varchar(64) NOT NULL,
	`nickname` varchar(40) NOT NULL,
	`regionCode` varchar(16) NOT NULL,
	`regionName` varchar(128) NOT NULL,
	`profileCompletedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `consumer_profiles_userOpenId` PRIMARY KEY(`userOpenId`)
);
--> statement-breakpoint
CREATE TABLE `consumer_referral_attributions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`consumerOpenId` varchar(64) NOT NULL,
	`referralCodeId` int NOT NULL,
	`referralCode` varchar(32) NOT NULL,
	`partnerOpenId` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `consumer_referral_attributions_id` PRIMARY KEY(`id`),
	CONSTRAINT `consumer_referral_consumer_uq` UNIQUE(`consumerOpenId`)
);
--> statement-breakpoint
CREATE TABLE `consumer_referral_codes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(32) NOT NULL,
	`partnerOpenId` varchar(64),
	`partnerLabel` varchar(96) NOT NULL,
	`status` enum('ACTIVE','DISABLED') NOT NULL DEFAULT 'ACTIVE',
	`expiresAt` timestamp,
	`createdByOpenId` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `consumer_referral_codes_id` PRIMARY KEY(`id`),
	CONSTRAINT `consumer_referral_code_uq` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE INDEX `consumer_identity_challenge_status_exp_idx` ON `consumer_identity_challenges` (`status`,`expiresAt`);--> statement-breakpoint
CREATE INDEX `consumer_membership_consent_user_idx` ON `consumer_membership_consents` (`userOpenId`,`id`);--> statement-breakpoint
CREATE INDEX `consumer_phone_hash_idx` ON `consumer_phone_identities` (`phoneHash`);--> statement-breakpoint
CREATE INDEX `consumer_profile_nickname_idx` ON `consumer_profiles` (`nickname`);--> statement-breakpoint
CREATE INDEX `consumer_referral_attribution_code_idx` ON `consumer_referral_attributions` (`referralCodeId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `consumer_referral_partner_idx` ON `consumer_referral_codes` (`partnerOpenId`,`status`);