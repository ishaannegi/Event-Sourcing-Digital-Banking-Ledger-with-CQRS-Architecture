package com.bank.ledger.events;

import java.math.BigDecimal;
import java.time.Instant;

public class FundsWithdrawnEvent implements DomainEvent {

    private String accountId;
    private BigDecimal amount;
    private Instant timestamp;

    public FundsWithdrawnEvent() {
    }

    public FundsWithdrawnEvent(String accountId, BigDecimal amount, Instant timestamp) {
        this.accountId = accountId;
        this.amount = amount;
        this.timestamp = timestamp;
    }

    @Override
    public String getAggregateId() {
        return accountId;
    }

    @Override
    public String getEventType() {
        return "FundsWithdrawnEvent";
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

    public BigDecimal getAmount() {
        return amount;
    }

    public void setAmount(BigDecimal amount) {
        this.amount = amount;
    }

    public void setTimestamp(Instant timestamp) {
        this.timestamp = timestamp;
    }
}
