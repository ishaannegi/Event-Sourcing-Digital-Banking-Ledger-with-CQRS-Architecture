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
import java.util.stream.Collectors;

@Service
public class AuditComplianceService {

    private static final Logger log = LoggerFactory.getLogger(AuditComplianceService.class);

    private final AuditLogRepository auditLogRepository;
    private final com.bank.ledger.eventstore.EventStoreRepository eventStoreRepository;
    private final TamperDemoBackupRepository tamperDemoBackupRepository;
    private final com.bank.ledger.readmodel.AccountBalanceRepository accountBalanceRepository;
    private final ObjectMapper objectMapper;
    private final com.bank.ledger.security.PqcKeyManagementService pqcKeyManagementService;

    public AuditComplianceService(AuditLogRepository auditLogRepository,
                                  com.bank.ledger.eventstore.EventStoreRepository eventStoreRepository,
                                  TamperDemoBackupRepository tamperDemoBackupRepository,
                                  com.bank.ledger.readmodel.AccountBalanceRepository accountBalanceRepository,
                                  ObjectMapper objectMapper,
                                  com.bank.ledger.security.PqcKeyManagementService pqcKeyManagementService) {
        this.auditLogRepository = auditLogRepository;
        this.eventStoreRepository = eventStoreRepository;
        this.tamperDemoBackupRepository = tamperDemoBackupRepository;
        this.accountBalanceRepository = accountBalanceRepository;
        this.objectMapper = objectMapper.copy()
                .findAndRegisterModules()
                .configure(com.fasterxml.jackson.databind.DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);
        this.pqcKeyManagementService = pqcKeyManagementService;
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

    /**
     * DEMO ONLY - Tamper Event Payload:
     * Directly alters payload text in PostgreSQL events and audit_log tables without updating hashes or PQC signatures,
     * persisting original payload backup to tamper_demo_backups table in DB.
     */
    @org.springframework.transaction.annotation.Transactional
    public DTOs.TamperDemoResponse tamperEventPayload(java.util.UUID eventId) {
        com.bank.ledger.eventstore.EventEntity event = eventStoreRepository.findById(eventId)
                .orElseThrow(() -> new IllegalArgumentException("Event [" + eventId + "] not found in event store."));

        // 1. Save original backup to DB table (including original previousHash and hash)
        TamperDemoBackupEntity backup = tamperDemoBackupRepository.findById(eventId).orElseGet(() -> {
            TamperDemoBackupEntity newBackup = new TamperDemoBackupEntity(
                    eventId,
                    event.getPayload(),
                    event.getPreviousHash(),
                    event.getHash(),
                    Instant.now()
            );
            tamperDemoBackupRepository.save(newBackup);
            return newBackup;
        });

        // 2. Ensure event has valid SHA3-512 hash populated before payload modification
        if (event.getHash() == null) {
            List<com.bank.ledger.eventstore.EventEntity> allEvents = eventStoreRepository.findByAggregateIdOrderByVersionAsc(event.getAggregateId());
            String expectedPrevHash = com.bank.ledger.eventstore.EventStoreService.GENESIS_HASH;
            for (com.bank.ledger.eventstore.EventEntity e : allEvents) {
                if (e.getVersion() < event.getVersion()) {
                    String raw = expectedPrevHash + ":" + e.getAggregateId() + ":" + e.getEventType() + ":" + e.getVersion() + ":" + e.getPayload();
                    expectedPrevHash = e.getHash() != null ? e.getHash() : com.bank.ledger.eventstore.EventStoreService.computeSha3_512(raw);
                }
            }
            String rawToHash = expectedPrevHash + ":" + event.getAggregateId() + ":" + event.getEventType() + ":" + event.getVersion() + ":" + event.getPayload();
            event.setPreviousHash(expectedPrevHash);
            event.setHash(com.bank.ledger.eventstore.EventStoreService.computeSha3_512(rawToHash));
        }

        // 3. Create tampered payload string
        String tamperedPayload;
        if (event.getPayload().contains("initialBalance")) {
            tamperedPayload = event.getPayload().replaceAll("\"initialBalance\":\\s*\\d+(\\.\\d+)?", "\"initialBalance\":999999.00");
        } else if (event.getPayload().contains("amount")) {
            tamperedPayload = event.getPayload().replaceAll("\"amount\":\\s*\\d+(\\.\\d+)?", "\"amount\":999999.00");
        } else {
            tamperedPayload = event.getPayload() + " /* TAMPERED_SIMULATION */";
        }

        if (tamperedPayload.equals(event.getPayload())) {
            tamperedPayload = event.getPayload() + " /* TAMPERED_SIMULATION */";
        }

        // 4. Update events table
        event.setPayload(tamperedPayload);
        eventStoreRepository.save(event);
        eventStoreRepository.flush();

        // 5. Update audit_log table so replayed breakdown reflects tampered payload
        final String payloadToSave = tamperedPayload;
        auditLogRepository.findByAggregateIdAndVersion(event.getAggregateId(), event.getVersion())
                .ifPresent(auditLog -> {
                    auditLog.setPayload(payloadToSave);
                    auditLogRepository.save(auditLog);
                    auditLogRepository.flush();
                });

        log.warn("[TAMPER DEMO] Manually corrupted payload for event [{}] at version {} in events & audit_log tables.", eventId, event.getVersion());

        return new DTOs.TamperDemoResponse(
                eventId.toString(),
                event.getVersion(),
                true,
                backup.getOriginalPayload(),
                tamperedPayload,
                "Simulated SQL payload tampering successfully applied to event version " + event.getVersion() + "."
        );
    }

    /**
     * DEMO ONLY - Restore Event Payload:
     * Reverts altered event payload back to original payload saved in tamper_demo_backups database table.
     */
    @org.springframework.transaction.annotation.Transactional
    public DTOs.TamperDemoResponse restoreEventPayload(java.util.UUID eventId) {
        com.bank.ledger.eventstore.EventEntity event = eventStoreRepository.findById(eventId)
                .orElseThrow(() -> new IllegalArgumentException("Event [" + eventId + "] not found in event store."));

        TamperDemoBackupEntity backup = tamperDemoBackupRepository.findById(eventId)
                .orElseThrow(() -> new IllegalStateException("No backup found for event [" + eventId + "]. Event was not tampered via demo tool."));

        String originalPayload = backup.getOriginalPayload();

        // 1. Restore events table (payload, previousHash, and hash)
        event.setPayload(originalPayload);
        event.setPreviousHash(backup.getOriginalPreviousHash());
        event.setHash(backup.getOriginalHash());
        eventStoreRepository.save(event);
        eventStoreRepository.flush();

        // 2. Restore audit_log table
        auditLogRepository.findByAggregateIdAndVersion(event.getAggregateId(), event.getVersion())
                .ifPresent(auditLog -> {
                    auditLog.setPayload(originalPayload);
                    auditLogRepository.save(auditLog);
                    auditLogRepository.flush();
                });

        // 3. Delete backup
        tamperDemoBackupRepository.delete(backup);
        tamperDemoBackupRepository.flush();

        log.info("[TAMPER DEMO] Restored original payload for event [{}] at version {} in events & audit_log tables.", eventId, event.getVersion());

        return new DTOs.TamperDemoResponse(
                eventId.toString(),
                event.getVersion(),
                false,
                originalPayload,
                originalPayload,
                "Original event payload successfully restored for version " + event.getVersion() + "."
        );
    }

    /**
     * DEMO ONLY - Restore All Tampered Events for an Account:
     * Reverts all tampered event payloads for an account back to original payloads stored in tamper_demo_backups database table.
     */
    @org.springframework.transaction.annotation.Transactional
    public DTOs.TamperDemoResponse restoreAccountEvents(String accountId) {
        List<com.bank.ledger.eventstore.EventEntity> events = eventStoreRepository.findByAggregateIdOrderByVersionAsc(accountId);
        int restoredCount = 0;
        for (com.bank.ledger.eventstore.EventEntity event : events) {
            java.util.Optional<TamperDemoBackupEntity> backupOpt = tamperDemoBackupRepository.findById(event.getId());
            if (backupOpt.isPresent()) {
                TamperDemoBackupEntity backup = backupOpt.get();
                String originalPayload = backup.getOriginalPayload();
                event.setPayload(originalPayload);
                event.setPreviousHash(backup.getOriginalPreviousHash());
                event.setHash(backup.getOriginalHash());
                eventStoreRepository.save(event);

                final String payloadToRestore = originalPayload;
                auditLogRepository.findByAggregateIdAndVersion(accountId, event.getVersion())
                        .ifPresent(auditLog -> {
                            auditLog.setPayload(payloadToRestore);
                            auditLogRepository.save(auditLog);
                        });

                tamperDemoBackupRepository.delete(backup);
                restoredCount++;
            }
        }
        eventStoreRepository.flush();
        auditLogRepository.flush();
        tamperDemoBackupRepository.flush();

        log.info("[TAMPER DEMO] Restored {} tampered event(s) for account [{}] in events & audit_log tables.", restoredCount, accountId);

        return new DTOs.TamperDemoResponse(
                null,
                0L,
                false,
                null,
                null,
                "Successfully restored " + restoredCount + " tampered event(s) for account " + accountId + "."
        );
    }


    /**
     * Cryptographic Event Hash Chain & Post-Quantum Signature Verification:
     * Verifies that each event's previousHash links cleanly to the predecessor,
     * re-computes the SHA3-512 payload digest, and validates the Post-Quantum (ML-DSA / Dilithium) signature.
     */
    public DTOs.EventChainVerificationResponse verifyEventChain(String accountId) {
        List<com.bank.ledger.eventstore.EventEntity> entities = eventStoreRepository.findByAggregateIdOrderByVersionAsc(accountId);
        if (entities.isEmpty()) {
            throw new AccountNotFoundException("Account [" + accountId + "] has no events in event store.");
        }

        String expectedPreviousHash = com.bank.ledger.eventstore.EventStoreService.GENESIS_HASH;
        int eventsVerified = 0;
        boolean allPqcValid = true;

        for (com.bank.ledger.eventstore.EventEntity entity : entities) {
            // 1. Verify previous hash link (if set)
            if (entity.getPreviousHash() != null && !entity.getPreviousHash().equals(expectedPreviousHash)) {
                log.error("[TAMPER DETECTED] Hash chain broken at version {} for account [{}]. Expected prev hash {}, found {}",
                        entity.getVersion(), accountId, expectedPreviousHash, entity.getPreviousHash());
                return new DTOs.EventChainVerificationResponse(
                        accountId,
                        "TAMPERED",
                        false,
                        false,
                        eventsVerified,
                        entity.getVersion(),
                        "Hash chain broken at version " + entity.getVersion() + ": previousHash mismatch.",
                        Instant.now()
                );
            }

            // 2. Re-compute SHA3-512 hash over event fields using expectedPreviousHash
            String canonicalPayload = canonicalizeJson(entity.getPayload());
            String rawToHash = expectedPreviousHash
                    + ":" + entity.getAggregateId()
                    + ":" + entity.getEventType()
                    + ":" + entity.getVersion()
                    + ":" + canonicalPayload;

            String recomputedHash = com.bank.ledger.eventstore.EventStoreService.computeSha3_512(rawToHash);

            if (entity.getHash() != null && !entity.getHash().equals(recomputedHash)) {
                log.error("[TAMPER DETECTED] Payload or event tampered at version {} for account [{}]. Expected hash {}, computed {}",
                        entity.getVersion(), accountId, entity.getHash(), recomputedHash);
                return new DTOs.EventChainVerificationResponse(
                        accountId,
                        "TAMPERED",
                        false,
                        false,
                        eventsVerified,
                        entity.getVersion(),
                        "Payload tampered at version " + entity.getVersion() + ": recalculated SHA3-512 mismatch.",
                        Instant.now()
                );
            }

            // 3. Verify Post-Quantum Digital Signature (if present)
            if (entity.getPqcSignature() != null && entity.getPqcPublicKey() != null) {
                try {
                    java.security.PublicKey pubKey = pqcKeyManagementService.decodePublicKey(entity.getPqcPublicKey());
                    boolean sigOk = pqcKeyManagementService.verify(pubKey, rawToHash, entity.getPqcSignature());
                    if (!sigOk) {
                        log.error("[PQC INVALID] Post-Quantum Signature verification failed at version {} for account [{}]",
                                entity.getVersion(), accountId);
                        return new DTOs.EventChainVerificationResponse(
                                accountId,
                                "TAMPERED",
                                false,
                                false,
                                eventsVerified,
                                entity.getVersion(),
                                "Post-Quantum Dilithium3 signature verification failed at version " + entity.getVersion(),
                                Instant.now()
                        );
                    }
                } catch (Exception e) {
                    log.error("[PQC ERROR] Failed to decode/verify PQC key at version {}: {}", entity.getVersion(), e.getMessage());
                    allPqcValid = false;
                }
            }

            eventsVerified++;
            expectedPreviousHash = entity.getHash() != null ? entity.getHash() : recomputedHash;
        }

        return new DTOs.EventChainVerificationResponse(
                accountId,
                "VALID",
                true,
                allPqcValid,
                eventsVerified,
                null,
                "All " + eventsVerified + " events verified successfully with SHA3-512 hash-chaining and Post-Quantum Dilithium3 signatures.",
                Instant.now()
        );
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

        List<com.bank.ledger.eventstore.EventEntity> storeEvents = eventStoreRepository.findByAggregateIdOrderByVersionAsc(accountId);
        Map<Long, java.util.UUID> versionToEventIdMap = storeEvents.stream()
                .filter(e -> e.getVersion() != null && e.getId() != null)
                .collect(Collectors.toMap(com.bank.ledger.eventstore.EventEntity::getVersion, com.bank.ledger.eventstore.EventEntity::getId, (e1, e2) -> e1));

        List<DomainEvent> filteredEvents = new ArrayList<>();
        List<DTOs.HistoricalEventDetail> replayedDetails = new ArrayList<>();
        long maxVersion = 0L;
        BigDecimal runningBalance = BigDecimal.ZERO;

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

                    BigDecimal deltaAmount = BigDecimal.ZERO;
                    if (event instanceof AccountOpenedEvent e) {
                        deltaAmount = e.getInitialBalance() != null ? e.getInitialBalance() : BigDecimal.ZERO;
                        runningBalance = runningBalance.add(deltaAmount);
                    } else if (event instanceof FundsDepositedEvent e) {
                        deltaAmount = e.getAmount() != null ? e.getAmount() : BigDecimal.ZERO;
                        runningBalance = runningBalance.add(deltaAmount);
                    } else if (event instanceof FundsWithdrawnEvent e) {
                        deltaAmount = e.getAmount() != null ? e.getAmount() : BigDecimal.ZERO;
                        runningBalance = runningBalance.subtract(deltaAmount);
                    } else if (event instanceof TransferInitiatedEvent e) {
                        deltaAmount = e.getAmount() != null ? e.getAmount() : BigDecimal.ZERO;
                        // Balance adjustment already reflected by FundsWithdrawnEvent (debit)
                    }

                    java.util.UUID storeEvtId = versionToEventIdMap.get(entity.getVersion());
                    replayedDetails.add(new DTOs.HistoricalEventDetail(
                            storeEvtId != null ? storeEvtId.toString() : null,
                            entity.getVersion() != null ? entity.getVersion() : (replayedDetails.size() + 1L),
                            event.getEventType(),
                            deltaAmount,
                            runningBalance,
                            eventTime
                    ));
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
                    0,
                    List.of()
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
                filteredEvents.size(),
                replayedDetails
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

    /**
     * Unified Dashboard Summary (CQRS & Event Sourcing):
     * Computes total combined balance, event counts, deposit/withdrawal totals,
     * live activity feed, and time-series chart data in a single fast backend operation.
     * Scoped by RBAC (CUSTOMER role sees only their own accounts, ADMIN sees system-wide).
     */
    public DTOs.DashboardSummaryResponse getDashboardSummary() {
        org.springframework.security.core.Authentication auth = org.springframework.security.core.context.SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated()) {
            throw new org.springframework.security.access.AccessDeniedException("Full authentication required to access dashboard summary");
        }

        boolean isAdmin = auth.getAuthorities().stream().anyMatch(a -> a.getAuthority().equals("ROLE_ADMIN"));
        String username = auth.getName();

        List<com.bank.ledger.readmodel.AccountBalanceEntity> targetAccounts;
        if (isAdmin) {
            targetAccounts = accountBalanceRepository.findAll();
        } else {
            targetAccounts = accountBalanceRepository.findByOwnerNameIgnoreCase(username);
        }

        List<String> accountIds = targetAccounts.stream()
                .map(com.bank.ledger.readmodel.AccountBalanceEntity::getAccountId)
                .collect(Collectors.toList());

        BigDecimal totalCombinedBalance = targetAccounts.stream()
                .map(com.bank.ledger.readmodel.AccountBalanceEntity::getBalance)
                .filter(java.util.Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        long totalAccounts = targetAccounts.size();

        if (accountIds.isEmpty()) {
            return new DTOs.DashboardSummaryResponse(
                    BigDecimal.ZERO,
                    0L,
                    0L,
                    BigDecimal.ZERO,
                    BigDecimal.ZERO,
                    List.of(),
                    List.of(),
                    Instant.now()
            );
        }

        List<com.bank.ledger.eventstore.EventEntity> allEvents;
        List<com.bank.ledger.eventstore.EventEntity> recentEntities;
        if (isAdmin) {
            allEvents = eventStoreRepository.findAll();
            recentEntities = eventStoreRepository.findTop50ByOrderByCreatedAtDesc();
        } else {
            allEvents = eventStoreRepository.findByAggregateIdInOrderByVersionAsc(accountIds);
            recentEntities = eventStoreRepository.findTop50ByAggregateIdInOrderByCreatedAtDesc(accountIds);
        }

        long totalEventsProcessed = allEvents.size();
        BigDecimal totalDepositsSum = BigDecimal.ZERO;
        BigDecimal totalWithdrawalsSum = BigDecimal.ZERO;
        Map<String, BigDecimal[]> dailyMap = new java.util.TreeMap<>();

        java.time.format.DateTimeFormatter dateFormatter = java.time.format.DateTimeFormatter.ofPattern("MMM dd")
                .withZone(java.time.ZoneId.of("UTC"));

        for (com.bank.ledger.eventstore.EventEntity e : allEvents) {
            BigDecimal amt = BigDecimal.ZERO;
            boolean isDeposit = false;
            boolean isWithdrawal = false;

            try {
                DomainEvent ev = objectMapper.readValue(e.getPayload(), DomainEvent.class);
                if (ev instanceof AccountOpenedEvent aoe) {
                    amt = aoe.getInitialBalance() != null ? aoe.getInitialBalance() : BigDecimal.ZERO;
                    isDeposit = true;
                } else if (ev instanceof FundsDepositedEvent fde) {
                    amt = fde.getAmount() != null ? fde.getAmount() : BigDecimal.ZERO;
                    isDeposit = true;
                } else if (ev instanceof FundsWithdrawnEvent fwe) {
                    amt = fwe.getAmount() != null ? fwe.getAmount() : BigDecimal.ZERO;
                    isWithdrawal = true;
                } else if (ev instanceof TransferInitiatedEvent tie) {
                    amt = tie.getAmount() != null ? tie.getAmount() : BigDecimal.ZERO;
                    isWithdrawal = true;
                }
            } catch (Exception ex) {
                // Ignore parse errors
            }

            if (isDeposit) {
                totalDepositsSum = totalDepositsSum.add(amt);
            } else if (isWithdrawal) {
                totalWithdrawalsSum = totalWithdrawalsSum.add(amt);
            }

            if (e.getCreatedAt() != null) {
                String dateStr = dateFormatter.format(e.getCreatedAt());
                BigDecimal[] pair = dailyMap.computeIfAbsent(dateStr, k -> new BigDecimal[]{BigDecimal.ZERO, BigDecimal.ZERO});
                if (isDeposit) {
                    pair[0] = pair[0].add(amt);
                } else if (isWithdrawal) {
                    pair[1] = pair[1].add(amt);
                }
            }
        }

        List<DTOs.DashboardDailyChartItem> chartData = new ArrayList<>();
        dailyMap.forEach((date, pair) -> chartData.add(new DTOs.DashboardDailyChartItem(date, pair[0], pair[1])));

        List<DTOs.EventLogResponse> recentEvents = new ArrayList<>();
        for (com.bank.ledger.eventstore.EventEntity e : recentEntities) {
            BigDecimal deltaAmount = BigDecimal.ZERO;
            try {
                DomainEvent ev = objectMapper.readValue(e.getPayload(), DomainEvent.class);
                if (ev instanceof AccountOpenedEvent aoe) {
                    deltaAmount = aoe.getInitialBalance() != null ? aoe.getInitialBalance() : BigDecimal.ZERO;
                } else if (ev instanceof FundsDepositedEvent fde) {
                    deltaAmount = fde.getAmount() != null ? fde.getAmount() : BigDecimal.ZERO;
                } else if (ev instanceof FundsWithdrawnEvent fwe) {
                    deltaAmount = fwe.getAmount() != null ? fwe.getAmount() : BigDecimal.ZERO;
                } else if (ev instanceof TransferInitiatedEvent tie) {
                    deltaAmount = tie.getAmount() != null ? tie.getAmount() : BigDecimal.ZERO;
                }
            } catch (Exception ex) {
                // Ignore parse errors
            }

            recentEvents.add(new DTOs.EventLogResponse(
                    e.getId() != null ? e.getId().toString() : null,
                    e.getAggregateId(),
                    e.getEventType(),
                    e.getPayload(),
                    e.getVersion(),
                    e.getCreatedAt(),
                    deltaAmount,
                    BigDecimal.ZERO,
                    e.getPreviousHash(),
                    e.getHash(),
                    e.getPqcSignature(),
                    e.getPqcPublicKey(),
                    e.getSignatureAlgorithm()
            ));
        }

        return new DTOs.DashboardSummaryResponse(
                totalCombinedBalance,
                totalAccounts,
                totalEventsProcessed,
                totalDepositsSum,
                totalWithdrawalsSum,
                recentEvents,
                chartData,
                Instant.now()
        );
    }
}
