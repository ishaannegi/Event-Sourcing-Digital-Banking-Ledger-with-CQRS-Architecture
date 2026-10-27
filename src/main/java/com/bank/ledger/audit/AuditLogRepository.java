package com.bank.ledger.audit;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;

@Repository
public interface AuditLogRepository extends JpaRepository<AuditLogEntity, Long> {

    List<AuditLogEntity> findByAggregateIdOrderByVersionAsc(String aggregateId);

    java.util.Optional<AuditLogEntity> findByAggregateIdAndVersion(String aggregateId, Long version);

    List<AuditLogEntity> findByProcessedAtBetweenOrderByProcessedAtAsc(Instant from, Instant to);

    @org.springframework.data.jpa.repository.Modifying
    @org.springframework.transaction.annotation.Transactional
    @org.springframework.data.jpa.repository.Query(
        value = "INSERT INTO audit_log (aggregate_id, event_type, version, payload, signature, received_at, processed_at) " +
                "VALUES (:aggregateId, :eventType, :version, CAST(:payload AS jsonb), :signature, :receivedAt, :processedAt) " +
                "ON CONFLICT (aggregate_id, version) DO NOTHING",
        nativeQuery = true
    )
    int insertIgnoreConflict(@org.springframework.data.repository.query.Param("aggregateId") String aggregateId,
                             @org.springframework.data.repository.query.Param("eventType") String eventType,
                             @org.springframework.data.repository.query.Param("version") Long version,
                             @org.springframework.data.repository.query.Param("payload") String payload,
                             @org.springframework.data.repository.query.Param("signature") String signature,
                             @org.springframework.data.repository.query.Param("receivedAt") Instant receivedAt,
                             @org.springframework.data.repository.query.Param("processedAt") Instant processedAt);
}
