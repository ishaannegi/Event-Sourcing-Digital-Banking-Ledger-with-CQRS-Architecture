package com.bank.ledger.eventstore;

import com.bank.ledger.events.DomainEvent;
import com.bank.ledger.events.KafkaEventProducer;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Service
public class EventStoreService {

    private final EventStoreRepository eventStoreRepository;
    private final ObjectMapper objectMapper;
    private final KafkaEventProducer kafkaEventProducer;

    public EventStoreService(EventStoreRepository eventStoreRepository, ObjectMapper objectMapper, KafkaEventProducer kafkaEventProducer) {
        this.eventStoreRepository = eventStoreRepository;
        this.objectMapper = objectMapper;
        this.kafkaEventProducer = kafkaEventProducer;
    }

    public List<DomainEvent> loadEventStream(String aggregateId) {
        List<EventEntity> entities = eventStoreRepository.findByAggregateIdOrderByVersionAsc(aggregateId);
        List<DomainEvent> events = new ArrayList<>();
        for (EventEntity entity : entities) {
            try {
                DomainEvent event = objectMapper.readValue(entity.getPayload(), DomainEvent.class);
                events.add(event);
            } catch (JsonProcessingException e) {
                throw new RuntimeException("Failed to deserialize event payload for aggregate: " + aggregateId, e);
            }
        }
        return events;
    }

    public long getLatestVersion(String aggregateId) {
        return eventStoreRepository.findTopByAggregateIdOrderByVersionDesc(aggregateId)
                .map(EventEntity::getVersion)
                .orElse(0L);
    }

    @Transactional
    public void appendEvents(String aggregateId, long expectedVersion, List<DomainEvent> events) {
        long currentVersion = getLatestVersion(aggregateId);
        if (currentVersion != expectedVersion) {
            throw new OptimisticLockingException(
                    "Optimistic lock failure for aggregate [" + aggregateId + "]: expected version " 
                    + expectedVersion + " but found version " + currentVersion);
        }

        long nextVersion = expectedVersion;
        List<EventEntity> entitiesToSave = new ArrayList<>();

        for (DomainEvent event : events) {
            nextVersion++;
            try {
                String payload = objectMapper.writeValueAsString(event);
                EventEntity entity = new EventEntity(
                        aggregateId,
                        event.getEventType(),
                        payload,
                        nextVersion,
                        event.getTimestamp() != null ? event.getTimestamp() : Instant.now()
                );
                entitiesToSave.add(entity);
            } catch (JsonProcessingException e) {
                throw new RuntimeException("Failed to serialize event for aggregate: " + aggregateId, e);
            }
        }

        try {
            List<EventEntity> savedEntities = eventStoreRepository.saveAll(entitiesToSave);
            eventStoreRepository.flush();

            // After successful event store commit, publish events to Kafka
            for (EventEntity saved : savedEntities) {
                kafkaEventProducer.publishEvent(
                        saved.getAggregateId(),
                        saved.getEventType(),
                        saved.getPayload(),
                        saved.getVersion()
                );
            }
        } catch (DataIntegrityViolationException e) {
            throw new OptimisticLockingException(
                    "Concurrent modification detected for aggregate [" + aggregateId + "]: unique constraint (aggregate_id, version) violated.");
        }
    }
}
