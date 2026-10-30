ALTER TABLE `business_payment_transactions` ADD `idempotencyKey` varchar(36);--> statement-breakpoint
UPDATE `business_payment_transactions` SET `idempotencyKey` = UUID() WHERE `idempotencyKey` IS NULL;--> statement-breakpoint
ALTER TABLE `business_payment_transactions` MODIFY `idempotencyKey` varchar(36) NOT NULL;--> statement-breakpoint
ALTER TABLE `business_payment_transactions` ADD CONSTRAINT `business_payment_transactions_idempotencyKey_unique` UNIQUE(`idempotencyKey`);