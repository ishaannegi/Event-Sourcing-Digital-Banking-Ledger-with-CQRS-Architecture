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

    public record AccountResponse(String accountId, String ownerName, BigDecimal balance, long version) {}
    public record TransferResponse(String transferId, String fromAccountId, String toAccountId, BigDecimal amount, String status) {}
    public record ErrorResponse(int status, String error, String message, long timestamp) {}
}
