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
    private ObjectMapper objectMapper;
    private AuditComplianceService service;

    @BeforeEach
    void setUp() {
        repository = mock(AuditLogRepository.class);
        objectMapper = new ObjectMapper()
                .findAndRegisterModules()
                .configure(com.fasterxml.jackson.databind.DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);
        service = new AuditComplianceService(repository, objectMapper);
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
}
