package com.bank.ledger.audit;

import com.bank.ledger.events.KafkaTopicConfig;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.time.Instant;

@Component
public class AuditConsumer {

    private static final Logger log = LoggerFactory.getLogger(AuditConsumer.class);

    private final AuditLogRepository auditLogRepository;

    public AuditConsumer(AuditLogRepository auditLogRepository) {
        this.auditLogRepository = auditLogRepository;
    }

    @KafkaListener(topics = KafkaTopicConfig.LEDGER_EVENTS_TOPIC, groupId = "audit-group")
    @Transactional
    public void consumeEvent(ConsumerRecord<String, String> record) {
        String aggregateId = record.key();
        String payload = record.value();

        String eventType = getHeader(record, "event_type");
        Long version = getHeaderAsLong(record, "version");
        String correlationId = getHeader(record, "correlation_id");

        if (correlationId != null) {
            MDC.put("correlationId", correlationId);
        }

        try {
            if (eventType == null || version == null) {
                log.warn("[AUDIT SERVICE] Received record for aggregate [{}] missing required headers.", aggregateId);
                return;
            }

            Instant receivedAt = Instant.ofEpochMilli(record.timestamp());
            Instant processedAt = Instant.now();

            if (auditLogRepository.findByAggregateIdAndVersion(aggregateId, version).isPresent()) {
                log.info("[AUDIT SERVICE] Idempotent check: Event version [{}] for aggregate [{}] already exists in audit_log. Skipping.",
                        version, aggregateId);
                return;
            }

            // Tamper-evident Audit Entry (Signature column left null for Phase 8 Post-Quantum signature integration)
            AuditLogEntity auditEntry = new AuditLogEntity(
                    aggregateId,
                    eventType,
                    version,
                    payload,
                    null, // Signature placeholder
                    receivedAt,
                    processedAt
            );

            auditLogRepository.save(auditEntry);

            log.info("[AUDIT SERVICE] Recorded event [{}] for aggregate [{}] version [{}] into tamper-evident audit_log (Offset: {})",
                    eventType, aggregateId, version, record.offset());
        } catch (Exception e) {
            log.error("[AUDIT SERVICE] Failed to record audit log entry for aggregate [{}]: {}", aggregateId, e.getMessage(), e);
        } finally {
            MDC.remove("correlationId");
        }
    }

    private String getHeader(ConsumerRecord<String, String> record, String key) {
        var header = record.headers().lastHeader(key);
        return header != null ? new String(header.value(), StandardCharsets.UTF_8) : null;
    }

    private Long getHeaderAsLong(ConsumerRecord<String, String> record, String key) {
        String val = getHeader(record, key);
        return val != null ? Long.parseLong(val) : null;
    }
}
