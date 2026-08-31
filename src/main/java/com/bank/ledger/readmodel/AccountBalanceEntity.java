package com.bank.ledger.readmodel;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.Instant;

@Entity
@Table(name = "account_balances")
public class AccountBalanceEntity {

    @Id
    @Column(name = "account_id")
    private String accountId;

    @Column(name = "owner_name", nullable = false)
    private String ownerName;

    @Column(name = "balance", nullable = false, precision = 19, scale = 4)
    private BigDecimal balance;

    @Column(name = "last_applied_version", nullable = false)
    private Long lastAppliedVersion;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public AccountBalanceEntity() {
    }

    public AccountBalanceEntity(String accountId, String ownerName, BigDecimal balance, Long lastAppliedVersion, Instant updatedAt) {
        this.accountId = accountId;
        this.ownerName = ownerName;
        this.balance = balance;
        this.lastAppliedVersion = lastAppliedVersion;
        this.updatedAt = updatedAt;
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

    public BigDecimal getBalance() {
        return balance;
    }

    public void setBalance(BigDecimal balance) {
        this.balance = balance;
    }

    public Long getLastAppliedVersion() {
        return lastAppliedVersion;
    }

    public void setLastAppliedVersion(Long lastAppliedVersion) {
        this.lastAppliedVersion = lastAppliedVersion;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(Instant updatedAt) {
        this.updatedAt = updatedAt;
    }
}
