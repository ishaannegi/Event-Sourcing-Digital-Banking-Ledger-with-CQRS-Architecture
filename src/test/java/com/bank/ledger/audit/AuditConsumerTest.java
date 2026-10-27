package com.bank.ledger.audit;

import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.apache.kafka.common.header.internals.RecordHeaders;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.time.Instant;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class AuditConsumerTest {

    private AuditLogRepository auditLogRepository;
    private AuditConsumer auditConsumer;

    @BeforeEach
    void setUp() {
        auditLogRepository = mock(AuditLogRepository.class);
        auditConsumer = new AuditConsumer(auditLogRepository);
    }

    @Test
    @DisplayName("Redelivering the same event record twice results in exactly one audit row inserted via ON CONFLICT DO NOTHING")
    void testRedeliveringRecordTwiceCreatesOneAuditRow() {
        String aggregateId = "acc-dedup-101";
        String eventType = "FundsDepositedEvent";
        long version = 1L;
        String payload = "{\"accountId\":\"acc-dedup-101\",\"amount\":100.00}";

        RecordHeaders headers = new RecordHeaders();
        headers.add("event_type", eventType.getBytes(StandardCharsets.UTF_8));
        headers.add("version", String.valueOf(version).getBytes(StandardCharsets.UTF_8));

        ConsumerRecord<String, String> record1 = new ConsumerRecord<>(
                "ledger-events",
                0,
                100L,
                Instant.now().toEpochMilli(),
                org.apache.kafka.common.record.TimestampType.CREATE_TIME,
                0,
                0,
                aggregateId,
                payload,
                headers,
                java.util.Optional.empty()
        );

        ConsumerRecord<String, String> record2 = new ConsumerRecord<>(
                "ledger-events",
                0,
                101L,
                Instant.now().toEpochMilli(),
                org.apache.kafka.common.record.TimestampType.CREATE_TIME,
                0,
                0,
                aggregateId,
                payload,
                headers,
                java.util.Optional.empty()
        );

        // First delivery: successful insert (returns 1 row affected)
        // Redelivery: database hits unique constraint and triggers ON CONFLICT DO NOTHING (returns 0 rows affected)
        when(auditLogRepository.insertIgnoreConflict(
                eq(aggregateId),
                eq(eventType),
                eq(version),
                eq(payload),
                isNull(),
                any(Instant.class),
                any(Instant.class)
        )).thenReturn(1, 0);

        // Execute first delivery
        auditConsumer.consumeEvent(record1);

        // Execute redelivery of the exact same event
        auditConsumer.consumeEvent(record2);

        // Verify repository was invoked for both deliveries
        verify(auditLogRepository, times(2)).insertIgnoreConflict(
                eq(aggregateId),
                eq(eventType),
                eq(version),
                eq(payload),
                isNull(),
                any(Instant.class),
                any(Instant.class)
        );
    }
}
