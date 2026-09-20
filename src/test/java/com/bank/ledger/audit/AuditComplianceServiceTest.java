package com.bank.ledger.audit;

import com.bank.ledger.api.DTOs;
import com.bank.ledger.events.AccountOpenedEvent;
import com.bank.ledger.events.FundsDepositedEvent;
import com.bank.ledger.events.FundsWithdrawnEvent;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class AuditComplianceServiceTest {

    private AuditLogRepository repository;
    private com.bank.ledger.eventstore.EventStoreRepository eventStoreRepository;
    private TamperDemoBackupRepository tamperDemoBackupRepository;
    private ObjectMapper objectMapper;
    private com.bank.ledger.security.PqcKeyManagementService pqcKeyManagementService;
    private AuditComplianceService service;

    @BeforeEach
    void setUp() {
        repository = mock(AuditLogRepository.class);
        eventStoreRepository = mock(com.bank.ledger.eventstore.EventStoreRepository.class);
        tamperDemoBackupRepository = mock(TamperDemoBackupRepository.class);
        objectMapper = new ObjectMapper()
                .findAndRegisterModules()
                .configure(com.fasterxml.jackson.databind.DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);
        pqcKeyManagementService = new com.bank.ledger.security.PqcKeyManagementService();
        service = new AuditComplianceService(repository, eventStoreRepository, tamperDemoBackupRepository, objectMapper, pqcKeyManagementService);
    }


    @Test
    @DisplayName("Point-in-time reconstruction replays events strictly up to target timestamp")
    void testReconstructBalanceAt() throws Exception {
        String accountId = "acc-audit-1";
        Instant t0 = Instant.parse("2026-09-01T10:00:00Z");
        Instant t1 = Instant.parse("2026-09-01T12:00:00Z");
        Instant t2 = Instant.parse("2026-09-01T14:00:00Z");

        AccountOpenedEvent e0 = new AccountOpenedEvent(accountId, "Alice", new BigDecimal("1000.00"), t0);
        FundsDepositedEvent e1 = new FundsDepositedEvent(accountId, new BigDecimal("500.00"), t1);
        FundsWithdrawnEvent e2 = new FundsWithdrawnEvent(accountId, new BigDecimal("200.00"), t2);

        AuditLogEntity log0 = new AuditLogEntity(accountId, "AccountOpenedEvent", 1L, objectMapper.writeValueAsString(e0), null, t0, t0);
        AuditLogEntity log1 = new AuditLogEntity(accountId, "FundsDepositedEvent", 2L, objectMapper.writeValueAsString(e1), null, t1, t1);
        AuditLogEntity log2 = new AuditLogEntity(accountId, "FundsWithdrawnEvent", 3L, objectMapper.writeValueAsString(e2), null, t2, t2);

        when(repository.findByAggregateIdOrderByVersionAsc(accountId)).thenReturn(List.of(log0, log1, log2));

        // Reconstruct at t1 -> Should include e0 and e1 ($1500) but exclude e2
        DTOs.HistoricalBalanceResponse responseT1 = service.reconstructBalanceAt(accountId, t1);
        assertEquals(new BigDecimal("1500.00"), responseT1.balance());
        assertEquals(2L, responseT1.version());
        assertEquals(2, responseT1.eventsReplayedCount());
        assertNotNull(responseT1.replayedEvents());
        assertEquals(2, responseT1.replayedEvents().size());
        assertEquals(new BigDecimal("1500.00"), responseT1.replayedEvents().get(1).runningBalance());

        // Reconstruct at t2 -> Should include e0, e1, and e2 ($1300)
        DTOs.HistoricalBalanceResponse responseT2 = service.reconstructBalanceAt(accountId, t2);
        assertEquals(new BigDecimal("1300.00"), responseT2.balance());
        assertEquals(3L, responseT2.version());
        assertEquals(3, responseT2.eventsReplayedCount());
        assertEquals(3, responseT2.replayedEvents().size());
        assertEquals(new BigDecimal("1300.00"), responseT2.replayedEvents().get(2).runningBalance());
    }

    @Test
    @DisplayName("Regulatory report aggregates transactions and volume accurately")
    void testGenerateRegulatoryReport() throws Exception {
        Instant from = Instant.parse("2026-09-01T00:00:00Z");
        Instant to = Instant.parse("2026-09-30T23:59:59Z");

        AccountOpenedEvent e1 = new AccountOpenedEvent("acc-1", "Alice", new BigDecimal("1000.00"), from);
        FundsDepositedEvent e2 = new FundsDepositedEvent("acc-1", new BigDecimal("500.00"), from);
        AccountOpenedEvent e3 = new AccountOpenedEvent("acc-2", "Bob", new BigDecimal("2000.00"), from);

        AuditLogEntity log1 = new AuditLogEntity("acc-1", "AccountOpenedEvent", 1L, objectMapper.writeValueAsString(e1), null, from, from);
        AuditLogEntity log2 = new AuditLogEntity("acc-1", "FundsDepositedEvent", 2L, objectMapper.writeValueAsString(e2), null, from, from);
        AuditLogEntity log3 = new AuditLogEntity("acc-2", "AccountOpenedEvent", 1L, objectMapper.writeValueAsString(e3), null, from, from);

        when(repository.findByProcessedAtBetweenOrderByProcessedAtAsc(from, to)).thenReturn(List.of(log1, log2, log3));

        DTOs.RegulatoryReportResponse report = service.generateRegulatoryReport(from, to);
        assertEquals(3L, report.totalTransactions());
        assertEquals(new BigDecimal("3500.00"), report.totalVolume());
        assertEquals(2L, report.accountTransactionCounts().get("acc-1"));
        assertEquals(1L, report.accountTransactionCounts().get("acc-2"));
    }

    @Test
    @DisplayName("verifyEventChain confirms valid SHA3-512 chain and detects payload tampering")
    void testVerifyEventChain() throws Exception {
        String accountId = "acc-chain-1";
        String p1 = service.canonicalizeJson("{\"accountId\":\"acc-chain-1\",\"ownerName\":\"Alice\",\"initialBalance\":1000.00}");
        String p2 = service.canonicalizeJson("{\"accountId\":\"acc-chain-1\",\"amount\":500.00}");

        String h0 = com.bank.ledger.eventstore.EventStoreService.GENESIS_HASH;
        String h1 = com.bank.ledger.eventstore.EventStoreService.computeSha3_512(h0 + ":" + accountId + ":AccountOpenedEvent:1:" + p1);
        String h2 = com.bank.ledger.eventstore.EventStoreService.computeSha3_512(h1 + ":" + accountId + ":FundsDepositedEvent:2:" + p2);

        com.bank.ledger.eventstore.EventEntity ev1 = new com.bank.ledger.eventstore.EventEntity(
                accountId, "AccountOpenedEvent", p1, 1L, Instant.now());
        ev1.setPreviousHash(h0);
        ev1.setHash(h1);

        com.bank.ledger.eventstore.EventEntity ev2 = new com.bank.ledger.eventstore.EventEntity(
                accountId, "FundsDepositedEvent", p2, 2L, Instant.now());
        ev2.setPreviousHash(h1);
        ev2.setHash(h2);

        when(eventStoreRepository.findByAggregateIdOrderByVersionAsc(accountId)).thenReturn(List.of(ev1, ev2));

        // 1. Valid chain test
        DTOs.EventChainVerificationResponse resValid = service.verifyEventChain(accountId);
        assertEquals("VALID", resValid.status());
        assertTrue(resValid.chainIntact());
        assertEquals(2, resValid.eventsVerified());
        assertNull(resValid.brokenAtVersion());

        // 2. Tampered payload test
        com.bank.ledger.eventstore.EventEntity ev2Tampered = new com.bank.ledger.eventstore.EventEntity(
                accountId, "FundsDepositedEvent", "{\"accountId\":\"acc-chain-1\",\"amount\":5000.00}", 2L, Instant.now());
        ev2Tampered.setPreviousHash(h1);
        ev2Tampered.setHash(h2); // Stale hash vs altered payload

        when(eventStoreRepository.findByAggregateIdOrderByVersionAsc(accountId)).thenReturn(List.of(ev1, ev2Tampered));

        DTOs.EventChainVerificationResponse resTampered = service.verifyEventChain(accountId);
        assertEquals("TAMPERED", resTampered.status());
        assertFalse(resTampered.chainIntact());
        assertEquals(2L, resTampered.brokenAtVersion());
    }

    @Test
    @DisplayName("tamperEventPayload modifies payload and creates persistent DB backup")
    void testTamperEventPayload() {
        java.util.UUID eventId = java.util.UUID.randomUUID();
        String originalPayload = "{\"accountId\":\"acc-1\",\"amount\":100.00}";
        com.bank.ledger.eventstore.EventEntity event = new com.bank.ledger.eventstore.EventEntity(
                "acc-1", "FundsDepositedEvent", originalPayload, 1L, Instant.now());

        when(eventStoreRepository.findById(eventId)).thenReturn(java.util.Optional.of(event));
        when(tamperDemoBackupRepository.findById(eventId)).thenReturn(java.util.Optional.empty());

        DTOs.TamperDemoResponse response = service.tamperEventPayload(eventId);

        assertTrue(response.isTampered());
        assertEquals(eventId.toString(), response.eventId());
        assertTrue(event.getPayload().contains("999999.00"));
        verify(tamperDemoBackupRepository, times(1)).save(any(TamperDemoBackupEntity.class));
        verify(eventStoreRepository, times(1)).save(event);
    }

    @Test
    @DisplayName("restoreEventPayload restores payload from persistent DB backup")
    void testRestoreEventPayload() {
        java.util.UUID eventId = java.util.UUID.randomUUID();
        String originalPayload = "{\"accountId\":\"acc-1\",\"amount\":100.00}";
        String tamperedPayload = "{\"accountId\":\"acc-1\",\"amount\":999999.99}";
        
        com.bank.ledger.eventstore.EventEntity event = new com.bank.ledger.eventstore.EventEntity(
                "acc-1", "FundsDepositedEvent", tamperedPayload, 1L, Instant.now());
        TamperDemoBackupEntity backup = new TamperDemoBackupEntity(eventId, originalPayload, Instant.now());

        when(eventStoreRepository.findById(eventId)).thenReturn(java.util.Optional.of(event));
        when(tamperDemoBackupRepository.findById(eventId)).thenReturn(java.util.Optional.of(backup));

        DTOs.TamperDemoResponse response = service.restoreEventPayload(eventId);

        assertFalse(response.isTampered());
        assertEquals(eventId.toString(), response.eventId());
        assertEquals(originalPayload, event.getPayload());
        verify(eventStoreRepository, times(1)).save(event);
        verify(tamperDemoBackupRepository, times(1)).delete(backup);
    }
}

