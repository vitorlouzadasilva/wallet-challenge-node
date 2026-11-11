-- CreateTable
CREATE TABLE `users` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(255) NOT NULL,
    `email` VARCHAR(255) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `wallets` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `balance_cents` BIGINT NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `wallets_user_id_key`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `operations` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `initiated_by_user_id` BIGINT UNSIGNED NOT NULL,
    `type` ENUM('deposit', 'transfer', 'reversal') NOT NULL,
    `status` ENUM('completed', 'reversed') NOT NULL DEFAULT 'completed',
    `amount_cents` BIGINT NOT NULL,
    `source_wallet_id` BIGINT UNSIGNED NULL,
    `destination_wallet_id` BIGINT UNSIGNED NULL,
    `idempotency_key` VARCHAR(128) NOT NULL,
    `reversal_of_operation_id` BIGINT UNSIGNED NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `operations_idempotency_key_key`(`idempotency_key`),
    UNIQUE INDEX `operations_reversal_of_operation_id_key`(`reversal_of_operation_id`),
    INDEX `operations_initiated_by_user_id_created_at_idx`(`initiated_by_user_id`, `created_at`),
    INDEX `operations_source_wallet_id_created_at_idx`(`source_wallet_id`, `created_at`),
    INDEX `operations_destination_wallet_id_created_at_idx`(`destination_wallet_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ledger_entries` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `operation_id` BIGINT UNSIGNED NOT NULL,
    `wallet_id` BIGINT UNSIGNED NOT NULL,
    `delta_cents` BIGINT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `ledger_entries_wallet_id_created_at_idx`(`wallet_id`, `created_at`),
    UNIQUE INDEX `ledger_entries_operation_id_wallet_id_key`(`operation_id`, `wallet_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `wallets` ADD CONSTRAINT `wallets_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `operations` ADD CONSTRAINT `operations_initiated_by_user_id_fkey` FOREIGN KEY (`initiated_by_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `operations` ADD CONSTRAINT `operations_source_wallet_id_fkey` FOREIGN KEY (`source_wallet_id`) REFERENCES `wallets`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `operations` ADD CONSTRAINT `operations_destination_wallet_id_fkey` FOREIGN KEY (`destination_wallet_id`) REFERENCES `wallets`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `operations` ADD CONSTRAINT `operations_reversal_of_operation_id_fkey` FOREIGN KEY (`reversal_of_operation_id`) REFERENCES `operations`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `ledger_entries` ADD CONSTRAINT `ledger_entries_operation_id_fkey` FOREIGN KEY (`operation_id`) REFERENCES `operations`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `ledger_entries` ADD CONSTRAINT `ledger_entries_wallet_id_fkey` FOREIGN KEY (`wallet_id`) REFERENCES `wallets`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Restrições monetárias que o Prisma Schema Language não expressa diretamente.
ALTER TABLE `operations` ADD CONSTRAINT `operations_amount_positive` CHECK (`amount_cents` > 0);
ALTER TABLE `ledger_entries` ADD CONSTRAINT `ledger_entries_delta_nonzero` CHECK (`delta_cents` <> 0);
