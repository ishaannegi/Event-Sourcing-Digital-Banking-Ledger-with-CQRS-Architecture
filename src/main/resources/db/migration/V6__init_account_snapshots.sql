CREATE TABLE account_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id VARCHAR(255) NOT NULL,
    version BIGINT NOT NULL,
    snapshot_payload JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT uq_account_snapshot_version UNIQUE (account_id, version)
);

CREATE INDEX idx_account_snapshots_account_id ON account_snapshots (account_id, version DESC);
