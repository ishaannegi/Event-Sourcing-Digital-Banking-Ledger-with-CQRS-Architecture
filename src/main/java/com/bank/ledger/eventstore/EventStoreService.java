package com.bank.ledger.eventstore;

import com.bank.ledger.events.DomainEvent;
import com.bank.ledger.events.KafkaEventProducer;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Service
public class EventStoreService {

    private static final Logger log = LoggerFactory.getLogger(EventStoreService.class);
    private final EventStoreRepository eventStoreRepository;
    private final ObjectMapper objectMapper;
    private final KafkaEventProducer kafkaEventProducer;
    private final com.bank.ledger.security.PqcKeyManagementService pqcKeyManagementService;

    public EventStoreService(EventStoreRepository eventStoreRepository,
                             ObjectMapper objectMapper,
                             KafkaEventProducer kafkaEventProducer,
                             com.bank.ledger.security.PqcKeyManagementService pqcKeyManagementService) {
        this.eventStoreRepository = eventStoreRepository;
        this.objectMapper = objectMapper;
        this.kafkaEventProducer = kafkaEventProducer;
        this.pqcKeyManagementService = pqcKeyManagementService;
    }

    public List<EventEntity> loadEventEntities(String aggregateId) {
        return eventStoreRepository.findByAggregateIdOrderByVersionAsc(aggregateId);
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

    public List<DomainEvent> loadEventStreamAfterVersion(String aggregateId, long afterVersion) {
        List<EventEntity> entities = eventStoreRepository.findByAggregateIdAndVersionGreaterThanOrderByVersionAsc(aggregateId, afterVersion);
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


    public static final String GENESIS_HASH = "GENESIS_0000000000000000000000000000000000000000000000000000000000000000";

    public static String computeSha3_512(String input) {
        try {
            java.security.MessageDigest digest = java.security.MessageDigest.getInstance("SHA3-512");
            byte[] hashBytes = digest.digest(input.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            StringBuilder hexString = new StringBuilder();
            for (byte b : hashBytes) {
                String hex = Integer.toHexString(0xff & b);
                if (hex.length() == 1) hexString.append('0');
                hexString.append(hex);
            }
            return hexString.toString();
        } catch (java.security.NoSuchAlgorithmException e) {
            throw new RuntimeException("SHA3-512 digest algorithm not available", e);
        }
    }

    public String canonicalizeJson(String json) {
        if (json == null || json.isBlank()) return "";
        try {
            com.fasterxml.jackson.databind.JsonNode tree = objectMapper.readTree(json);
            return objectMapper.writeValueAsString(sortJsonNode(tree));
        } catch (Exception e) {
            return json;
        }
    }

    private com.fasterxml.jackson.databind.JsonNode sortJsonNode(com.fasterxml.jackson.databind.JsonNode node) {
        if (node.isObject()) {
            com.fasterxml.jackson.databind.node.ObjectNode sortedNode = objectMapper.createObjectNode();
            java.util.List<String> fieldNames = new java.util.ArrayList<>();
            node.fieldNames().forEachRemaining(fieldNames::add);
            java.util.Collections.sort(fieldNames);
            for (String fieldName : fieldNames) {
                sortedNode.set(fieldName, sortJsonNode(node.get(fieldName)));
            }
            return sortedNode;
        } else if (node.isArray()) {
            com.fasterxml.jackson.databind.node.ArrayNode sortedArray = objectMapper.createArrayNode();
            for (com.fasterxml.jackson.databind.JsonNode child : node) {
                sortedArray.add(sortJsonNode(child));
            }
            return sortedArray;
        }
        return node;
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
            log.warn("Optimistic lock failure for aggregate [{}]: expected version {} but found {}",
                    aggregateId, expectedVersion, currentVersion);
            throw new OptimisticLockingException(
                    "Optimistic lock failure for aggregate [" + aggregateId + "]: expected version " 
                    + expectedVersion + " but found version " + currentVersion);
        }

        log.info("Appending {} event(s) to event store for aggregate [{}] starting at version {}",
                events.size(), aggregateId, expectedVersion + 1);

        List<EventEntity> existingEvents = eventStoreRepository.findByAggregateIdOrderByVersionAsc(aggregateId);
        String lastHash = GENESIS_HASH;
        for (EventEntity e : existingEvents) {
            if (e.getHash() != null && !e.getHash().isBlank()) {
                lastHash = e.getHash();
            } else {
                String raw = lastHash + ":" + aggregateId + ":" + e.getEventType() + ":" + e.getVersion() + ":" + canonicalizeJson(e.getPayload());
                lastHash = computeSha3_512(raw);
            }
        }

        // Get PQC KeyPair for signing aggregate events
        java.security.KeyPair pqcKeyPair = pqcKeyManagementService.getOrCreateAccountKeyPair(aggregateId);
        String encodedPubKey = pqcKeyManagementService.encodePublicKey(pqcKeyPair.getPublic());

        long nextVersion = expectedVersion;
        List<EventEntity> entitiesToSave = new ArrayList<>();

        for (DomainEvent event : events) {
            nextVersion++;
            try {
                String payload = objectMapper.writeValueAsString(event);
                String canonicalPayload = canonicalizeJson(payload);
                Instant timestamp = event.getTimestamp() != null ? event.getTimestamp() : Instant.now();

                String previousHash = lastHash;
                String rawToHash = previousHash + ":" + aggregateId + ":" + event.getEventType() + ":" + nextVersion + ":" + canonicalPayload;
                String currentHash = computeSha3_512(rawToHash);

                // Compute Post-Quantum Digital Signature over rawToHash
                String pqcSig = pqcKeyManagementService.sign(pqcKeyPair.getPrivate(), rawToHash);

                EventEntity entity = new EventEntity(
                        aggregateId,
                        event.getEventType(),
                        payload,
                        nextVersion,
                        timestamp
                );
                entity.setPreviousHash(previousHash);
                entity.setHash(currentHash);
                entity.setPqcSignature(pqcSig);
                entity.setPqcPublicKey(encodedPubKey);
                entity.setSignatureAlgorithm(com.bank.ledger.security.PqcKeyManagementService.ALGORITHM);

                lastHash = currentHash;
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

