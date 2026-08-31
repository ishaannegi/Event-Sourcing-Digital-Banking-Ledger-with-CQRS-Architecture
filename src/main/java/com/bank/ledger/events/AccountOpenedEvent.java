package com.bank.ledger.events;

import java.math.BigDecimal;
import java.time.Instant;

public class AccountOpenedEvent implements DomainEvent {

    private String accountId;
    private String ownerName;
    private BigDecimal initialBalance;
    private Instant timestamp;

    public AccountOpenedEvent() {
    }

    public AccountOpenedEvent(String accountId, String ownerName, BigDecimal initialBalance, Instant timestamp) {
        this.accountId = accountId;
        this.ownerName = ownerName;
        this.initialBalance = initialBalance;
        this.timestamp = timestamp;
    }

    @Override
    public String getAggregateId() {
        return accountId;
    }

    @Override
    public String getEventType() {
        return "AccountOpenedEvent";
    }

    @Override
    public Instant getTimestamp() {
        return timestamp;
    }

    public String getAccountId() {
        return accountId;
    }

    public void setAccountId(String accountId) {
        this.accountId = accountId;
    }

    public String getOwnerName() {
        return ownerName;
    }

    public void setOwnerName(String ownerName) {
        this.ownerName = ownerName;
    }

    public BigDecimal getInitialBalance() {
        return initialBalance;
    }

    public void setInitialBalance(BigDecimal initialBalance) {
        this.initialBalance = initialBalance;
    }

    public void setTimestamp(Instant timestamp) {
        this.timestamp = timestamp;
    }
}
