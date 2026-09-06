CREATE TABLE IF NOT EXISTS audit_log (
    id BIGSERIAL PRIMARY KEY,
    aggregate_id VARCHAR(50) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    version BIGINT NOT NULL,
    payload JSONB NOT NULL,
    signature VARCHAR(512), -- Extension point for Phase 8 Post-Quantum signature verification
    received_at TIMESTAMP WITH TIME ZONE NOT NULL,
    processed_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_log_aggregate_version ON audit_log(aggregate_id, version);
CREATE INDEX IF NOT EXISTS idx_audit_log_processed_at ON audit_log(processed_at);
