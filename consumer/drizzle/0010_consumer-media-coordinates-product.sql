ALTER TABLE `consumerCoupons` ADD `productId` varchar(128);--> statement-breakpoint
ALTER TABLE `consumerCoupons` ADD `image` varchar(768);--> statement-breakpoint
ALTER TABLE `consumerCoupons` ADD `images` json;--> statement-breakpoint
ALTER TABLE `consumerCoupons` ADD `storeImageUrl` varchar(768);--> statement-breakpoint
ALTER TABLE `consumerCoupons` ADD `foodImageUrl` varchar(768);--> statement-breakpoint
ALTER TABLE `consumerCoupons` ADD `mediaItems` json;--> statement-breakpoint
ALTER TABLE `consumerCoupons` ADD `latitude` double;--> statement-breakpoint
ALTER TABLE `consumerCoupons` ADD `longitude` double;