-- Add unique constraint to prevent duplicate audit_log entries on at-least-once CDC redelivery
ALTER TABLE audit_log ADD CONSTRAINT uq_audit_log_aggregate_version UNIQUE (aggregate_id, version);
