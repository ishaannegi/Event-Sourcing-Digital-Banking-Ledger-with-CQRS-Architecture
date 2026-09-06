package com.bank.ledger.audit;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;

@Repository
public interface AuditLogRepository extends JpaRepository<AuditLogEntity, Long> {

    List<AuditLogEntity> findByAggregateIdOrderByVersionAsc(String aggregateId);

    List<AuditLogEntity> findByProcessedAtBetweenOrderByProcessedAtAsc(Instant from, Instant to);
}
