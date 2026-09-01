package com.bank.ledger.readmodel;

import com.bank.ledger.api.DTOs;
import com.bank.ledger.events.AccountOpenedEvent;
import com.bank.ledger.events.DomainEvent;
import com.bank.ledger.events.FundsDepositedEvent;
import com.bank.ledger.events.FundsWithdrawnEvent;
import com.bank.ledger.events.KafkaTopicConfig;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Optional;

@Component
public class AccountProjectionConsumer {

    private static final Logger log = LoggerFactory.getLogger(AccountProjectionConsumer.class);

    private final AccountBalanceRepository repository;
    private final ObjectMapper objectMapper;
    private final AccountCacheService accountCacheService;

    public AccountProjectionConsumer(AccountBalanceRepository repository, ObjectMapper objectMapper, AccountCacheService accountCacheService) {
        this.repository = repository;
        this.objectMapper = objectMapper;
        this.accountCacheService = accountCacheService;
    }

    @KafkaListener(topics = KafkaTopicConfig.LEDGER_EVENTS_TOPIC, groupId = "${spring.kafka.consumer.group-id:ledger-group}")
    @Transactional
    public void consumeEvent(ConsumerRecord<String, String> record) {
        String aggregateId = record.key();
        String payload = record.value();

        String eventType = getHeader(record, "event_type");
        Long version = getHeaderAsLong(record, "version");

        try {
            DomainEvent event = objectMapper.readValue(payload, DomainEvent.class);
            if (version == null) {
                log.warn("Received record for aggregate [{}] missing version header.", aggregateId);
                return;
            }

            Optional<AccountBalanceEntity> existing = repository.findById(aggregateId);
            long lastAppliedVersion = existing.map(AccountBalanceEntity::getLastAppliedVersion).orElse(0L);

            // 1. Idempotency Check: Skip duplicate/already applied events
            if (version <= lastAppliedVersion) {
                log.info("Idempotent check: Event version [{}] for aggregate [{}] <= last applied version [{}]. Skipping.",
                        version, aggregateId, lastAppliedVersion);
                return;
            }

            // 2. Sequence Gap Warning
            if (version > lastAppliedVersion + 1 && !(event instanceof AccountOpenedEvent)) {
                log.warn("Sequence gap detected for aggregate [{}]: event version [{}] > expected [{}]",
                        aggregateId, version, lastAppliedVersion + 1);
            }

            // 3. Apply Projection Update & Perform Write-Through to Redis Cache
            AccountBalanceEntity savedEntity = null;

            if (event instanceof AccountOpenedEvent e) {
                AccountBalanceEntity entity = new AccountBalanceEntity(
                        e.getAccountId(),
                        e.getOwnerName(),
                        e.getInitialBalance(),
                        version,
                        Instant.now()
                );
                savedEntity = repository.save(entity);
                log.info("Projection: Opened account [{}] with initial balance [{}] (version {})",
                        e.getAccountId(), e.getInitialBalance(), version);
            } else if (event instanceof FundsDepositedEvent e) {
                AccountBalanceEntity entity = existing.orElseThrow(() ->
                        new IllegalStateException("Account balance entity not found for deposit: " + aggregateId));
                entity.setBalance(entity.getBalance().add(e.getAmount()));
                entity.setLastAppliedVersion(version);
                entity.setUpdatedAt(Instant.now());
                savedEntity = repository.save(entity);
                log.info("Projection: Deposited [{}] to account [{}], new balance [{}] (version {})",
                        e.getAmount(), aggregateId, entity.getBalance(), version);
            } else if (event instanceof FundsWithdrawnEvent e) {
                AccountBalanceEntity entity = existing.orElseThrow(() ->
                        new IllegalStateException("Account balance entity not found for withdrawal: " + aggregateId));
                entity.setBalance(entity.getBalance().subtract(e.getAmount()));
                entity.setLastAppliedVersion(version);
                entity.setUpdatedAt(Instant.now());
                savedEntity = repository.save(entity);
                log.info("Projection: Withdrew [{}] from account [{}], new balance [{}] (version {})",
                        e.getAmount(), aggregateId, entity.getBalance(), version);
            }

            // Perform Write-Through Cache Update to Redis
            if (savedEntity != null) {
                DTOs.AccountResponse cacheDto = new DTOs.AccountResponse(
                        savedEntity.getAccountId(),
                        savedEntity.getOwnerName(),
                        savedEntity.getBalance(),
                        savedEntity.getLastAppliedVersion()
                );
                accountCacheService.put(savedEntity.getAccountId(), cacheDto);
            }
        } catch (Exception e) {
            log.error("Failed to project Kafka record for aggregate [{}]: {}", aggregateId, e.getMessage(), e);
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
