CREATE TABLE `communicationMembers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`roomId` int NOT NULL,
	`clientUserId` varchar(128) NOT NULL,
	`displayName` varchar(120) NOT NULL,
	`joinedAt` timestamp NOT NULL DEFAULT (now()),
	`leftAt` timestamp,
	`lastReadMessageId` int,
	CONSTRAINT `communicationMembers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `communicationMessages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`roomId` int NOT NULL,
	`clientMessageId` varchar(96) NOT NULL,
	`senderId` varchar(128) NOT NULL,
	`senderName` varchar(120) NOT NULL,
	`text` text,
	`attachmentUrl` varchar(768),
	`attachmentType` varchar(80),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `communicationMessages_id` PRIMARY KEY(`id`),
	CONSTRAINT `communicationMessages_clientMessageId_unique` UNIQUE(`clientMessageId`)
);
--> statement-breakpoint
CREATE TABLE `communicationPushSubscriptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clientUserId` varchar(128) NOT NULL,
	`endpoint` varchar(1024) NOT NULL,
	`subscription` json NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `communicationPushSubscriptions_id` PRIMARY KEY(`id`),
	CONSTRAINT `communicationPushSubscriptions_endpoint_unique` UNIQUE(`endpoint`)
);
--> statement-breakpoint
CREATE TABLE `communicationRooms` (
	`id` int AUTO_INCREMENT NOT NULL,
	`meetingId` int NOT NULL,
	`meetingTitle` varchar(200) NOT NULL,
	`thumbnailUrl` varchar(768),
	`category` varchar(80),
	`lastMessage` text,
	`lastMessageAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `communicationRooms_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `communication_members_room_user_idx` ON `communicationMembers` (`roomId`,`clientUserId`);--> statement-breakpoint
CREATE INDEX `communication_messages_room_created_idx` ON `communicationMessages` (`roomId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `communication_rooms_meeting_idx` ON `communicationRooms` (`meetingId`);