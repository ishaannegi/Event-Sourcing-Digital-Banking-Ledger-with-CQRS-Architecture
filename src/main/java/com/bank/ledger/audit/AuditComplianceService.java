package com.bank.ledger.audit;

import com.bank.ledger.api.DTOs;
import com.bank.ledger.command.AccountAggregate;
import com.bank.ledger.command.AccountNotFoundException;
import com.bank.ledger.events.AccountOpenedEvent;
import com.bank.ledger.events.DomainEvent;
import com.bank.ledger.events.FundsDepositedEvent;
import com.bank.ledger.events.FundsWithdrawnEvent;
import com.bank.ledger.events.TransferInitiatedEvent;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class AuditComplianceService {

    private static final Logger log = LoggerFactory.getLogger(AuditComplianceService.class);

    private final AuditLogRepository auditLogRepository;
    private final ObjectMapper objectMapper;

    public AuditComplianceService(AuditLogRepository auditLogRepository, ObjectMapper objectMapper) {
        this.auditLogRepository = auditLogRepository;
        this.objectMapper = objectMapper.copy()
                .findAndRegisterModules()
                .configure(com.fasterxml.jackson.databind.DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);
    }

    /**
     * Point-In-Time Balance Reconstruction:
     * Replays audit log events for an account up to a given timestamp to reconstruct
     * historical balance and version as of that moment.
     */
    public DTOs.HistoricalBalanceResponse reconstructBalanceAt(String accountId, Instant targetTimestamp) {
        List<AuditLogEntity> logs = auditLogRepository.findByAggregateIdOrderByVersionAsc(accountId);
        if (logs.isEmpty()) {
            throw new AccountNotFoundException("Account [" + accountId + "] not found in audit trail.");
        }

        List<DomainEvent> filteredEvents = new ArrayList<>();
        long maxVersion = 0L;
        for (AuditLogEntity entity : logs) {
            try {
                DomainEvent event = objectMapper.readValue(entity.getPayload(), DomainEvent.class);
                Instant eventTime = entity.getReceivedAt() != null ? entity.getReceivedAt() : event.getTimestamp();
                // Include event if its timestamp is <= targetTimestamp
                if (eventTime != null && !eventTime.isAfter(targetTimestamp)) {
                    filteredEvents.add(event);
                    if (entity.getVersion() != null && entity.getVersion() > maxVersion) {
                        maxVersion = entity.getVersion();
                    }
                }
            } catch (Exception e) {
                log.error("[AUDIT SERVICE] Failed to deserialize audit payload for aggregate [{}]: {}", accountId, e.getMessage());
            }
        }

        if (filteredEvents.isEmpty()) {
            return new DTOs.HistoricalBalanceResponse(
                    accountId,
                    "N/A (Not Opened Yet)",
                    BigDecimal.ZERO,
                    0L,
                    targetTimestamp,
                    0
            );
        }

        AccountAggregate aggregate = AccountAggregate.replay(filteredEvents);
        long responseVersion = maxVersion > 0 ? maxVersion : aggregate.getVersion();

        return new DTOs.HistoricalBalanceResponse(
                aggregate.getAccountId() != null ? aggregate.getAccountId() : accountId,
                aggregate.getOwnerName() != null ? aggregate.getOwnerName() : "N/A",
                aggregate.getBalance(),
                responseVersion,
                targetTimestamp,
                filteredEvents.size()
        );
    }

    /**
     * Simple Regulatory Report:
     * Computes total transactions, total financial volume, and per-account transaction counts
     * for a given date range strictly from the audit_log table.
     */
    public DTOs.RegulatoryReportResponse generateRegulatoryReport(Instant from, Instant to) {
        List<AuditLogEntity> auditEntries = auditLogRepository.findByProcessedAtBetweenOrderByProcessedAtAsc(from, to);

        long totalTransactions = auditEntries.size();
        BigDecimal totalVolume = BigDecimal.ZERO;
        Map<String, Long> accountTransactionCounts = new HashMap<>();

        for (AuditLogEntity entity : auditEntries) {
            String accountId = entity.getAggregateId();
            accountTransactionCounts.put(accountId, accountTransactionCounts.getOrDefault(accountId, 0L) + 1);

            try {
                DomainEvent event = objectMapper.readValue(entity.getPayload(), DomainEvent.class);
                if (event instanceof AccountOpenedEvent e) {
                    totalVolume = totalVolume.add(e.getInitialBalance());
                } else if (event instanceof FundsDepositedEvent e) {
                    totalVolume = totalVolume.add(e.getAmount());
                } else if (event instanceof FundsWithdrawnEvent e) {
                    totalVolume = totalVolume.add(e.getAmount());
                } else if (event instanceof TransferInitiatedEvent e) {
                    totalVolume = totalVolume.add(e.getAmount());
                }
            } catch (Exception e) {
                log.error("[AUDIT SERVICE] Error processing report payload for aggregate [{}]: {}", accountId, e.getMessage());
            }
        }

        return new DTOs.RegulatoryReportResponse(
                from,
                to,
                totalTransactions,
                totalVolume,
                accountTransactionCounts,
                Instant.now()
        );
    }
}
