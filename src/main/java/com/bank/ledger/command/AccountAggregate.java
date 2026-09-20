package com.bank.ledger.command;

import com.bank.ledger.events.AccountOpenedEvent;
import com.bank.ledger.events.DomainEvent;
import com.bank.ledger.events.FundsDepositedEvent;
import com.bank.ledger.events.FundsWithdrawnEvent;
import com.bank.ledger.events.TransferInitiatedEvent;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

public class AccountAggregate {

    private String accountId;
    private String ownerName;
    private BigDecimal balance = BigDecimal.ZERO;
    private long version = 0L;
    private boolean active = false;

    public AccountAggregate() {
    }

    public static AccountAggregate replay(List<DomainEvent> events) {
        AccountAggregate aggregate = new AccountAggregate();
        for (DomainEvent event : events) {
            aggregate.apply(event);
        }
        return aggregate;
    }

    public static AccountAggregate replayFromSnapshot(AccountAggregate snapshotState, List<DomainEvent> remainingEvents) {
        AccountAggregate aggregate = new AccountAggregate();
        if (snapshotState != null) {
            aggregate.accountId = snapshotState.accountId;
            aggregate.ownerName = snapshotState.ownerName;
            aggregate.balance = snapshotState.balance != null ? snapshotState.balance : BigDecimal.ZERO;
            aggregate.version = snapshotState.version;
            aggregate.active = snapshotState.active;
        }
        for (DomainEvent event : remainingEvents) {
            aggregate.apply(event);
        }
        return aggregate;
    }


    public void apply(DomainEvent event) {
        this.version++;
        if (event instanceof AccountOpenedEvent e) {
            this.accountId = e.getAccountId();
            this.ownerName = e.getOwnerName();
            this.balance = e.getInitialBalance() != null ? e.getInitialBalance() : BigDecimal.ZERO;
            this.active = true;
        } else if (event instanceof FundsDepositedEvent e) {
            this.balance = this.balance.add(e.getAmount());
        } else if (event instanceof FundsWithdrawnEvent e) {
            this.balance = this.balance.subtract(e.getAmount());
        } else if (event instanceof TransferInitiatedEvent e) {
            // Balance adjustment is already handled by accompanying FundsWithdrawnEvent (debit)
            // and FundsDepositedEvent (credit). TransferInitiatedEvent serves as the double-entry
            // linking event and does not mutate balance to prevent double-deduction.
        }
    }

    public AccountOpenedEvent createAccount(String accountId, String ownerName, BigDecimal initialBalance) {
        if (this.active) {
            throw new InvalidCommandException("Account [" + accountId + "] is already open.");
        }
        if (ownerName == null || ownerName.trim().isEmpty()) {
            throw new InvalidCommandException("Owner name cannot be empty.");
        }
        if (initialBalance == null || initialBalance.compareTo(BigDecimal.ZERO) < 0) {
            throw new InvalidCommandException("Initial balance cannot be negative.");
        }
        return new AccountOpenedEvent(accountId, ownerName, initialBalance, Instant.now());
    }

    public FundsDepositedEvent deposit(BigDecimal amount) {
        validateActiveAccount();
        if (amount == null || amount.compareTo(BigDecimal.ZERO) <= 0) {
            throw new InvalidCommandException("Deposit amount must be positive.");
        }
        return new FundsDepositedEvent(this.accountId, amount, Instant.now());
    }

    public FundsWithdrawnEvent withdraw(BigDecimal amount) {
        validateActiveAccount();
        if (amount == null || amount.compareTo(BigDecimal.ZERO) <= 0) {
            throw new InvalidCommandException("Withdrawal amount must be positive.");
        }
        if (this.balance.compareTo(amount) < 0) {
            throw new InsufficientBalanceException(
                    "Insufficient balance in account [" + this.accountId + "]. Current: " + this.balance + ", Required: " + amount);
        }
        return new FundsWithdrawnEvent(this.accountId, amount, Instant.now());
    }

    public void validateTransferSource(BigDecimal amount) {
        validateActiveAccount();
        if (amount == null || amount.compareTo(BigDecimal.ZERO) <= 0) {
            throw new InvalidCommandException("Transfer amount must be positive.");
        }
        if (this.balance.compareTo(amount) < 0) {
            throw new InsufficientBalanceException(
                    "Insufficient balance in source account [" + this.accountId + "]. Current: " + this.balance + ", Transfer requested: " + amount);
        }
    }

    public void validateTransferDestination() {
        validateActiveAccount();
    }

    private void validateActiveAccount() {
        if (!this.active) {
            throw new AccountNotFoundException("Account is not active or does not exist.");
        }
    }

    public String getAccountId() {
        return accountId;
    }

    public String getOwnerName() {
        return ownerName;
    }

    public BigDecimal getBalance() {
        return balance;
    }

    public long getVersion() {
        return version;
    }

    public boolean isActive() {
        return active;
    }
}
