CREATE TABLE tamper_demo_backups (
    event_id UUID PRIMARY KEY,
    original_payload JSONB NOT NULL,
    backed_up_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);
