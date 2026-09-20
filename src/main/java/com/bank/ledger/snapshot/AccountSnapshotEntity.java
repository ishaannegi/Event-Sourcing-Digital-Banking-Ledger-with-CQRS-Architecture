package com.bank.ledger.snapshot;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "account_snapshots")
public class AccountSnapshotEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.AUTO)
    private UUID id;

    @Column(name = "account_id", nullable = false)
    private String accountId;

    @Column(name = "version", nullable = false)
    private Long version;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "snapshot_payload", nullable = false, columnDefinition = "jsonb")
    private String snapshotPayload;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    public AccountSnapshotEntity() {
    }

    public AccountSnapshotEntity(String accountId, Long version, String snapshotPayload, Instant createdAt) {
        this.accountId = accountId;
        this.version = version;
        this.snapshotPayload = snapshotPayload;
        this.createdAt = createdAt;
    }

    public UUID getId() {
        return id;
    }

    public String getAccountId() {
        return accountId;
    }

    public void setAccountId(String accountId) {
        this.accountId = accountId;
    }

    public Long getVersion() {
        return version;
    }

    public void setVersion(Long version) {
        this.version = version;
    }

    public String getSnapshotPayload() {
        return snapshotPayload;
    }

    public void setSnapshotPayload(String snapshotPayload) {
        this.snapshotPayload = snapshotPayload;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }
}
