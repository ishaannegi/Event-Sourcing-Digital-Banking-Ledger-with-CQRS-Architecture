package com.bank.ledger.api;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;
import java.math.BigDecimal;

public class DTOs {

    public record OpenAccountRequest(
            @NotBlank(message = "Owner name is required")
            String ownerName,

            @NotNull(message = "Initial balance is required")
            @PositiveOrZero(message = "Initial balance cannot be negative")
            BigDecimal initialBalance
    ) {}

    public record DepositRequest(
            @NotNull(message = "Deposit amount is required")
            @Positive(message = "Deposit amount must be positive")
            BigDecimal amount
    ) {}

    public record WithdrawRequest(
            @NotNull(message = "Withdrawal amount is required")
            @Positive(message = "Withdrawal amount must be positive")
            BigDecimal amount
    ) {}

    public record TransferRequest(
            @NotBlank(message = "Source account ID is required")
            String fromAccountId,

            @NotBlank(message = "Destination account ID is required")
            String toAccountId,

            @NotNull(message = "Transfer amount is required")
            @Positive(message = "Transfer amount must be positive")
            BigDecimal amount
    ) {}

    public record LoginRequest(
            @NotBlank(message = "Username is required")
            String username,

            @NotBlank(message = "Password is required")
            String password
    ) {}

    public record RegisterRequest(
            @NotBlank(message = "Username is required")
            String username,

            @NotBlank(message = "Password is required")
            String password,

            String role
    ) {}

    public record LoginResponse(String token, String username, String role) {}

    public record HistoricalEventDetail(
            long version,
            String eventType,
            BigDecimal amount,
            BigDecimal runningBalance,
            java.time.Instant timestamp
    ) {}

    public record HistoricalBalanceResponse(
            String accountId,
            String ownerName,
            BigDecimal balance,
            long version,
            java.time.Instant asOfTimestamp,
            int eventsReplayedCount,
            java.util.List<HistoricalEventDetail> replayedEvents
    ) {}

    public record RegulatoryReportResponse(
            java.time.Instant from,
            java.time.Instant to,
            long totalTransactions,
            BigDecimal totalVolume,
            java.util.Map<String, Long> accountTransactionCounts,
            java.time.Instant reportGeneratedAt
    ) {}

    public record AccountResponse(String accountId, String ownerName, BigDecimal balance, long version) {}
    public record TransferResponse(String transferId, String fromAccountId, String toAccountId, BigDecimal amount, String status) {}
    public record EventLogResponse(String id, String aggregateId, String eventType, String payload, long version, java.time.Instant createdAt, BigDecimal amount, BigDecimal runningBalance) {}
    public record ErrorResponse(int status, String error, String message, long timestamp) {}
}
