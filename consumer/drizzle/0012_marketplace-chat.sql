CREATE TABLE `marketplaceChatMessages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`roomKey` varchar(96) NOT NULL,
	`clientMessageId` varchar(96) NOT NULL,
	`senderId` varchar(128) NOT NULL,
	`senderName` varchar(120) NOT NULL,
	`senderRole` enum('buyer','seller') NOT NULL,
	`text` text,
	`attachmentUrl` varchar(768),
	`attachmentType` varchar(80),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `marketplaceChatMessages_id` PRIMARY KEY(`id`),
	CONSTRAINT `marketplace_chat_room_message_unique` UNIQUE(`roomKey`,`clientMessageId`)
);
--> statement-breakpoint
CREATE TABLE `marketplaceChatReports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`roomKey` varchar(96) NOT NULL,
	`reporterId` varchar(128) NOT NULL,
	`reportedUserId` varchar(128) NOT NULL,
	`reason` varchar(80) NOT NULL,
	`details` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `marketplaceChatReports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `marketplaceChatRooms` (
	`roomKey` varchar(96) NOT NULL,
	`listingId` varchar(96) NOT NULL,
	`buyerId` varchar(128) NOT NULL,
	`buyerName` varchar(120) NOT NULL,
	`sellerId` varchar(128) NOT NULL,
	`sellerName` varchar(120) NOT NULL,
	`lastMessage` text,
	`lastMessageAt` timestamp,
	`lastMessageId` int,
	`buyerLastReadMessageId` int NOT NULL DEFAULT 0,
	`sellerLastReadMessageId` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `marketplaceChatRooms_roomKey` PRIMARY KEY(`roomKey`),
	CONSTRAINT `marketplace_chat_listing_buyer_unique` UNIQUE(`listingId`,`buyerId`)
);
--> statement-breakpoint
CREATE TABLE `marketplaceListings` (
	`listingId` varchar(96) NOT NULL,
	`sellerId` varchar(128) NOT NULL,
	`sellerName` varchar(120) NOT NULL,
	`title` varchar(160) NOT NULL,
	`category` varchar(80) NOT NULL,
	`price` int,
	`description` text NOT NULL,
	`regionCode` varchar(32) NOT NULL,
	`regionLabel` varchar(160) NOT NULL,
	`photoUrls` json NOT NULL,
	`status` enum('판매중','예약중','거래완료') NOT NULL DEFAULT '판매중',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `marketplaceListings_listingId` PRIMARY KEY(`listingId`)
);
--> statement-breakpoint
CREATE TABLE `marketplaceUserBlocks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`blockerId` varchar(128) NOT NULL,
	`blockedId` varchar(128) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `marketplaceUserBlocks_id` PRIMARY KEY(`id`),
	CONSTRAINT `marketplace_user_block_unique` UNIQUE(`blockerId`,`blockedId`)
);
--> statement-breakpoint
CREATE INDEX `marketplace_chat_messages_room_created_idx` ON `marketplaceChatMessages` (`roomKey`,`createdAt`);--> statement-breakpoint
CREATE INDEX `marketplace_chat_reports_room_idx` ON `marketplaceChatReports` (`roomKey`);--> statement-breakpoint
CREATE INDEX `marketplace_chat_reports_reporter_idx` ON `marketplaceChatReports` (`reporterId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `marketplace_chat_buyer_idx` ON `marketplaceChatRooms` (`buyerId`,`lastMessageAt`);--> statement-breakpoint
CREATE INDEX `marketplace_chat_seller_idx` ON `marketplaceChatRooms` (`sellerId`,`lastMessageAt`);--> statement-breakpoint
CREATE INDEX `marketplace_listings_region_status_idx` ON `marketplaceListings` (`regionCode`,`status`);--> statement-breakpoint
CREATE INDEX `marketplace_listings_seller_idx` ON `marketplaceListings` (`sellerId`);--> statement-breakpoint
CREATE INDEX `marketplace_user_blocks_target_idx` ON `marketplaceUserBlocks` (`blockedId`);