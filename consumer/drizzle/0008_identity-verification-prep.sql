CREATE TABLE `identityConsents` (
	`id` varchar(128) NOT NULL,
	`userId` varchar(128) NOT NULL,
	`verificationId` varchar(128) NOT NULL,
	`consentType` varchar(64) NOT NULL,
	`policyVersion` varchar(32) NOT NULL,
	`acceptedAt` timestamp NOT NULL DEFAULT (now()),
	`ipHash` varchar(128),
	`userAgent` varchar(512),
	CONSTRAINT `identityConsents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `identityVerifications` (
	`id` varchar(128) NOT NULL,
	`userId` varchar(128) NOT NULL,
	`provider` enum('DANAL') NOT NULL DEFAULT 'DANAL',
	`status` enum('PENDING','VERIFIED','FAILED','EXPIRED') NOT NULL DEFAULT 'PENDING',
	`providerVerificationId` varchar(200),
	`name` varchar(120),
	`phone` varchar(40),
	`gender` enum('MALE','FEMALE','UNKNOWN'),
	`birthDate` varchar(10),
	`ageBracket` varchar(32),
	`isMinor` boolean,
	`ciHash` varchar(128),
	`diHash` varchar(128),
	`verifiedAt` timestamp,
	`expiresAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `identityVerifications_id` PRIMARY KEY(`id`),
	CONSTRAINT `identityVerifications_providerVerificationId_unique` UNIQUE(`providerVerificationId`)
);
--> statement-breakpoint
CREATE INDEX `identity_consents_verification_idx` ON `identityConsents` (`verificationId`);--> statement-breakpoint
CREATE INDEX `identity_consents_user_type_idx` ON `identityConsents` (`userId`,`consentType`);--> statement-breakpoint
CREATE INDEX `identity_verifications_user_status_idx` ON `identityVerifications` (`userId`,`status`);--> statement-breakpoint
CREATE INDEX `identity_verifications_ci_idx` ON `identityVerifications` (`ciHash`);