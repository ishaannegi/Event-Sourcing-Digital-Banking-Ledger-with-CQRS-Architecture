package com.bank.ledger.audit;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.UUID;

@Repository
public interface TamperDemoBackupRepository extends JpaRepository<TamperDemoBackupEntity, UUID> {
}
