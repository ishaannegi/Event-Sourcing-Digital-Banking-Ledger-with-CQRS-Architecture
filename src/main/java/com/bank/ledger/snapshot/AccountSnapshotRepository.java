package com.bank.ledger.snapshot;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

@Repository
public interface AccountSnapshotRepository extends JpaRepository<AccountSnapshotEntity, UUID> {
    Optional<AccountSnapshotEntity> findTopByAccountIdOrderByVersionDesc(String accountId);
}
