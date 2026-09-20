package com.bank.ledger.snapshot;

import com.bank.ledger.command.AccountAggregate;
import com.bank.ledger.events.AccountOpenedEvent;
import com.bank.ledger.events.FundsDepositedEvent;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class AccountSnapshotServiceTest {

    private AccountSnapshotRepository repository;
    private ObjectMapper objectMapper;
    private AccountSnapshotService service;

    @BeforeEach
    void setUp() {
        repository = mock(AccountSnapshotRepository.class);
        objectMapper = new ObjectMapper()
                .findAndRegisterModules()
                .configure(com.fasterxml.jackson.databind.DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);
        service = new AccountSnapshotService(repository, objectMapper);
    }

    @Test
    @DisplayName("Create and deserialize aggregate snapshot successfully")
    void testSaveAndDeserializeSnapshot() throws Exception {
        String accountId = "acc-snap-100";
        AccountOpenedEvent open = new AccountOpenedEvent(accountId, "David", new BigDecimal("5000.00"), Instant.now());
        FundsDepositedEvent dep = new FundsDepositedEvent(accountId, new BigDecimal("1500.00"), Instant.now());

        AccountAggregate aggregate = AccountAggregate.replay(List.of(open, dep));
        assertEquals(2L, aggregate.getVersion());
        assertEquals(new BigDecimal("6500.00"), aggregate.getBalance());

        String jsonPayload = objectMapper.writeValueAsString(aggregate);
        AccountSnapshotEntity entity = new AccountSnapshotEntity(accountId, 2L, jsonPayload, Instant.now());

        when(repository.save(any(AccountSnapshotEntity.class))).thenReturn(entity);

        AccountSnapshotEntity saved = service.saveSnapshot(aggregate);
        assertNotNull(saved);
        assertEquals(2L, saved.getVersion());

        AccountAggregate restored = service.deserializeSnapshot(saved);
        assertEquals("acc-snap-100", restored.getAccountId());
        assertEquals("David", restored.getOwnerName());
        assertEquals(new BigDecimal("6500.00"), restored.getBalance());
        assertEquals(2L, restored.getVersion());
    }

    @Test
    @DisplayName("Replay from snapshot restores state and applies subsequent events correctly")
    void testReplayFromSnapshot() {
        String accountId = "acc-snap-200";
        AccountOpenedEvent open = new AccountOpenedEvent(accountId, "Eve", new BigDecimal("1000.00"), Instant.now());
        AccountAggregate snapState = AccountAggregate.replay(List.of(open));
        assertEquals(1L, snapState.getVersion());

        // Subsequent events after snapshot (version > 1)
        FundsDepositedEvent dep1 = new FundsDepositedEvent(accountId, new BigDecimal("500.00"), Instant.now());
        FundsDepositedEvent dep2 = new FundsDepositedEvent(accountId, new BigDecimal("250.00"), Instant.now());

        AccountAggregate replayed = AccountAggregate.replayFromSnapshot(snapState, List.of(dep1, dep2));
        assertEquals(3L, replayed.getVersion());
        assertEquals(new BigDecimal("1750.00"), replayed.getBalance());
        assertEquals("Eve", replayed.getOwnerName());
    }
}
