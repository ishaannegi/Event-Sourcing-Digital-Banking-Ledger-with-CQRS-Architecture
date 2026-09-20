package com.bank.ledger.snapshot;

import com.bank.ledger.command.AccountAggregate;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.Optional;

@Service
public class AccountSnapshotService {

    private static final Logger log = LoggerFactory.getLogger(AccountSnapshotService.class);
    public static final long SNAPSHOT_THRESHOLD = 5; // Create snapshot every 5 events for testing/performance

    private final AccountSnapshotRepository snapshotRepository;
    private final ObjectMapper objectMapper;

    public AccountSnapshotService(AccountSnapshotRepository snapshotRepository, ObjectMapper objectMapper) {
        this.snapshotRepository = snapshotRepository;
        this.objectMapper = objectMapper;
    }

    public Optional<AccountSnapshotEntity> getLatestSnapshot(String accountId) {
        return snapshotRepository.findTopByAccountIdOrderByVersionDesc(accountId);
    }

    public AccountAggregate deserializeSnapshot(AccountSnapshotEntity snapshotEntity) {
        try {
            return objectMapper.readValue(snapshotEntity.getSnapshotPayload(), AccountAggregate.class);
        } catch (Exception e) {
            log.error("Failed to deserialize aggregate snapshot for account [{}]: {}", snapshotEntity.getAccountId(), e.getMessage());
            throw new RuntimeException("Failed to deserialize aggregate snapshot", e);
        }
    }

    public void createSnapshotIfNeeded(AccountAggregate aggregate) {
        if (aggregate == null || aggregate.getAccountId() == null || aggregate.getVersion() <= 0) {
            return;
        }

        Optional<AccountSnapshotEntity> latestOpt = getLatestSnapshot(aggregate.getAccountId());
        long lastSnapshotVersion = latestOpt.map(AccountSnapshotEntity::getVersion).orElse(0L);

        if (aggregate.getVersion() - lastSnapshotVersion >= SNAPSHOT_THRESHOLD) {
            saveSnapshot(aggregate);
        }
    }

    public AccountSnapshotEntity saveSnapshot(AccountAggregate aggregate) {
        try {
            String payload = objectMapper.writeValueAsString(aggregate);
            AccountSnapshotEntity entity = new AccountSnapshotEntity(
                    aggregate.getAccountId(),
                    aggregate.getVersion(),
                    payload,
                    Instant.now()
            );
            AccountSnapshotEntity saved = snapshotRepository.save(entity);
            log.info("[SNAPSHOT CREATED] Saved aggregate snapshot for account [{}] at version {}",
                    aggregate.getAccountId(), aggregate.getVersion());
            return saved;
        } catch (Exception e) {
            log.error("Failed to save snapshot for account [{}]: {}", aggregate.getAccountId(), e.getMessage());
            throw new RuntimeException("Failed to save aggregate snapshot", e);
        }
    }
}
