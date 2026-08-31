package com.bank.ledger.command;

import java.math.BigDecimal;

public class Commands {

    public record OpenAccountCommand(String ownerName, BigDecimal initialBalance) {}
    public record DepositCommand(String accountId, BigDecimal amount) {}
    public record WithdrawCommand(String accountId, BigDecimal amount) {}
    public record TransferCommand(String fromAccountId, String toAccountId, BigDecimal amount) {}
}
