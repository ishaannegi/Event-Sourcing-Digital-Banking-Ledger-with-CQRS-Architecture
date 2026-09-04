package com.bank.ledger.events;

import org.apache.kafka.clients.producer.ProducerRecord;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;

@Component
public class KafkaEventProducer {

    private static final Logger log = LoggerFactory.getLogger(KafkaEventProducer.class);
    private final KafkaTemplate<String, String> kafkaTemplate;

    public KafkaEventProducer(KafkaTemplate<String, String> kafkaTemplate) {
        this.kafkaTemplate = kafkaTemplate;
    }

    /**
     * Publishes committed domain event to Kafka.
     * Note: In production systems, an Outbox Pattern (writing to an outbox table in DB
     * and a CDC worker/Debezium polling it) is recommended to guarantee atomic DB + Kafka delivery.
     * For this project, we attempt direct publish and log errors without failing the DB transaction.
     */
    public void publishEvent(String aggregateId, String eventType, String payload, long version) {
        try {
            ProducerRecord<String, String> record = new ProducerRecord<>(
                    KafkaTopicConfig.LEDGER_EVENTS_TOPIC,
                    aggregateId, // Partition Key ensures per-account ordering
                    payload
            );

            record.headers().add("event_type", eventType.getBytes(StandardCharsets.UTF_8));
            record.headers().add("version", String.valueOf(version).getBytes(StandardCharsets.UTF_8));

            String correlationId = org.slf4j.MDC.get("correlationId");
            if (correlationId != null) {
                record.headers().add("correlation_id", correlationId.getBytes(StandardCharsets.UTF_8));
            }

            kafkaTemplate.send(record).whenComplete((result, ex) -> {
                if (ex != null) {
                    log.error("Failed to publish event [{}] for aggregate [{}] version [{}]: {}",
                            eventType, aggregateId, version, ex.getMessage(), ex);
                } else {
                    log.info("Published event [{}] for aggregate [{}] version [{}] to partition [{}] at offset [{}]",
                            eventType, aggregateId, version,
                            result.getRecordMetadata().partition(),
                            result.getRecordMetadata().offset());
                }
            });
        } catch (Exception e) {
            log.error("Exception initiating Kafka publish for event [{}] aggregate [{}]: {}",
                    eventType, aggregateId, e.getMessage(), e);
        }
    }
}
