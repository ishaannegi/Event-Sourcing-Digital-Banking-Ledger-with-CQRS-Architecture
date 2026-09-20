package com.bank.ledger.eventstore;

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
@Table(name = "events")
public class EventEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.AUTO)
    private UUID id;

    @Column(name = "aggregate_id", nullable = false)
    private String aggregateId;

    @Column(name = "event_type", nullable = false)
    private String eventType;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "payload", nullable = false, columnDefinition = "jsonb")
    private String payload;

    @Column(name = "version", nullable = false)
    private Long version;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "previous_hash", length = 128)
    private String previousHash;

    @Column(name = "hash", length = 128)
    private String hash;

    @Column(name = "pqc_signature", columnDefinition = "TEXT")
    private String pqcSignature;

    @Column(name = "pqc_public_key", columnDefinition = "TEXT")
    private String pqcPublicKey;

    @Column(name = "signature_algorithm", length = 50)
    private String signatureAlgorithm;

    public EventEntity() {
    }

    public EventEntity(String aggregateId, String eventType, String payload, Long version, Instant createdAt) {
        this.aggregateId = aggregateId;
        this.eventType = eventType;
        this.payload = payload;
        this.version = version;
        this.createdAt = createdAt;
    }

    public UUID getId() {
        return id;
    }

    public String getAggregateId() {
        return aggregateId;
    }

    public void setAggregateId(String aggregateId) {
        this.aggregateId = aggregateId;
    }

    public String getEventType() {
        return eventType;
    }

    public void setEventType(String eventType) {
        this.eventType = eventType;
    }

    public String getPayload() {
        return payload;
    }

    public void setPayload(String payload) {
        this.payload = payload;
    }

    public Long getVersion() {
        return version;
    }

    public void setVersion(Long version) {
        this.version = version;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public String getPreviousHash() {
        return previousHash;
    }

    public void setPreviousHash(String previousHash) {
        this.previousHash = previousHash;
    }

    public String getHash() {
        return hash;
    }

    public void setHash(String hash) {
        this.hash = hash;
    }

    public String getPqcSignature() {
        return pqcSignature;
    }

    public void setPqcSignature(String pqcSignature) {
        this.pqcSignature = pqcSignature;
    }

    public String getPqcPublicKey() {
        return pqcPublicKey;
    }

    public void setPqcPublicKey(String pqcPublicKey) {
        this.pqcPublicKey = pqcPublicKey;
    }

    public String getSignatureAlgorithm() {
        return signatureAlgorithm;
    }

    public void setSignatureAlgorithm(String signatureAlgorithm) {
        this.signatureAlgorithm = signatureAlgorithm;
    }
}

