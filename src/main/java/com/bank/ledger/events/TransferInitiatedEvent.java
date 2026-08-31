package com.bank.ledger.events;

import java.math.BigDecimal;
import java.time.Instant;

public class TransferInitiatedEvent implements DomainEvent {

    private String transferId;
    private String fromAccountId;
    private String toAccountId;
    private BigDecimal amount;
    private Instant timestamp;

    public TransferInitiatedEvent() {
    }

    public TransferInitiatedEvent(String transferId, String fromAccountId, String toAccountId, BigDecimal amount, Instant timestamp) {
        this.transferId = transferId;
        this.fromAccountId = fromAccountId;
        this.toAccountId = toAccountId;
        this.amount = amount;
        this.timestamp = timestamp;
    }

    @Override
    public String getAggregateId() {
        return fromAccountId;
    }

    @Override
    public String getEventType() {
        return "TransferInitiatedEvent";
    }

    @Override
    public Instant getTimestamp() {
        return timestamp;
    }

    public String getTransferId() {
        return transferId;
    }

    public void setTransferId(String transferId) {
        this.transferId = transferId;
    }

    public String getFromAccountId() {
        return fromAccountId;
    }

    public void setFromAccountId(String fromAccountId) {
        this.fromAccountId = fromAccountId;
    }

    public String getToAccountId() {
        return toAccountId;
    }

    public void setToAccountId(String toAccountId) {
        this.toAccountId = toAccountId;
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
