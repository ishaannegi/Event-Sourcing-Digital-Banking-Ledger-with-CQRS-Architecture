package com.bank.ledger.audit;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "tamper_demo_backups")
public class TamperDemoBackupEntity {

    @Id
    @Column(name = "event_id", nullable = false)
    private UUID eventId;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "original_payload", nullable = false, columnDefinition = "jsonb")
    private String originalPayload;

    @Column(name = "original_previous_hash", length = 128)
    private String originalPreviousHash;

    @Column(name = "original_hash", length = 128)
    private String originalHash;

    @Column(name = "backed_up_at", nullable = false)
    private Instant backedUpAt;

    public TamperDemoBackupEntity() {
    }

    public TamperDemoBackupEntity(UUID eventId, String originalPayload, Instant backedUpAt) {
        this.eventId = eventId;
        this.originalPayload = originalPayload;
        this.backedUpAt = backedUpAt;
    }

    public TamperDemoBackupEntity(UUID eventId, String originalPayload, String originalPreviousHash, String originalHash, Instant backedUpAt) {
        this.eventId = eventId;
        this.originalPayload = originalPayload;
        this.originalPreviousHash = originalPreviousHash;
        this.originalHash = originalHash;
        this.backedUpAt = backedUpAt;
    }

    public UUID getEventId() {
        return eventId;
    }

    public void setEventId(UUID eventId) {
        this.eventId = eventId;
    }

    public String getOriginalPayload() {
        return originalPayload;
    }

    public void setOriginalPayload(String originalPayload) {
        this.originalPayload = originalPayload;
    }

    public String getOriginalPreviousHash() {
        return originalPreviousHash;
    }

    public void setOriginalPreviousHash(String originalPreviousHash) {
        this.originalPreviousHash = originalPreviousHash;
    }

    public String getOriginalHash() {
        return originalHash;
    }

    public void setOriginalHash(String originalHash) {
        this.originalHash = originalHash;
    }

    public Instant getBackedUpAt() {
        return backedUpAt;
    }

    public void setBackedUpAt(Instant backedUpAt) {
        this.backedUpAt = backedUpAt;
    }
}
