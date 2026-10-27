# CDC Operational Runbook: Direct Producer & Debezium CDC Modes

This runbook documents the operational architecture, invariants, and step-by-step procedures for switching between **Direct Publishing Mode** (`ledger.publish.mode: direct`) and **Debezium Change Data Capture (CDC) Mode** (`ledger.publish.mode: cdc`), as well as executing a zero-data-loss rollback.

---

## 1. Architecture & The Double-Publishing Hazard

### Architecture Overview
The Digital Banking Ledger supports two distinct event streaming paths from PostgreSQL to Apache Kafka topic `ledger-events`:

```
Mode: DIRECT
  [REST Request] ──> [Command Handler] ──> [PostgreSQL: events (Commit)]
                                      └──> [KafkaEventProducer (direct)] ──> [Kafka: ledger-events]

Mode: CDC (Transactional Outbox via Event Store)
  [REST Request] ──> [Command Handler] ──> [PostgreSQL: events (Commit)]
                                                              │ (WAL)
                                                [Debezium Postgres Connector]
                                                              │ (SMT Pipeline)
                                                              ▼
                                                    [Kafka: ledger-events]
```

### The Double-Publishing Hazard
If the application is running in `direct` mode while the Debezium `events-cdc-connector` is also `RUNNING`, **both systems will independently emit every committed event to `ledger-events`**.
- **Impact**: Duplicate events on `ledger-events`, concurrent consumer race conditions, duplicated read model ledger versions, and unneeded consumer load.
- **Safety Invariant**: At any given time, **either** the direct producer is publishing **or** the CDC connector is streaming, **NEVER BOTH**.
- **Enforcement**: `PublishModeConsistencyGuard` executes at application startup to check the status of `events-cdc-connector` via Kafka Connect REST API (`http://localhost:8083/connectors/events-cdc-connector/status`). If `publish.mode=direct` and the connector is `RUNNING`, it emits a critical hazard alarm (or prevents startup under strict mode).

---

## 2. Runbook A: Migration from Direct to CDC Mode

### Pre-requisites & Verification
1. Verify PostgreSQL logical replication configuration:
   ```sql
   SHOW wal_level; -- Must be 'logical'
   SHOW max_replication_slots; -- Must be >= 10
   ```
2. Verify Kafka Connect is healthy:
   ```powershell
   Invoke-RestMethod -Uri "http://localhost:8083/connectors"
   ```

### Step-by-Step Procedure
1. **Stop or Drain Traffic**:
   Temporarily stop incoming write traffic or ensure all pending in-flight transactions complete.
2. **Switch Application Configuration to CDC**:
   In `application.yml` (or via environment variable `LEDGER_PUBLISH_MODE=cdc`):
   ```yaml
   ledger:
     publish:
       mode: cdc
   ```
3. **Deploy / Restart Backend Application**:
   Restart Spring Boot with `ledger.publish.mode=cdc`. In this mode, `KafkaEventProducer` skips direct dispatch to Kafka.
4. **Register / Resume Debezium Connector**:
   If the connector is not registered:
   ```powershell
   Invoke-RestMethod -Uri "http://localhost:8083/connectors" -Method Post -ContentType "application/json" -InFile "debezium/events-connector.json"
   ```
   If already registered but paused:
   ```powershell
   Invoke-RestMethod -Uri "http://localhost:8083/connectors/events-cdc-connector/resume" -Method Put
   ```
5. **Verify Connector State**:
   ```powershell
   $status = Invoke-RestMethod -Uri "http://localhost:8083/connectors/events-cdc-connector/status"
   $status.connector.state # Must be "RUNNING"
   $status.tasks[0].state  # Must be "RUNNING"
   ```
6. **Verify End-to-End Delivery**:
   Issue a test deposit and verify that the event appears on `ledger-events` and updates the read model `account_balances` and `audit_log`.

---

## 3. Runbook B: Rollback from CDC to Direct Mode

Use this procedure if Debezium Connect experiences an unrecoverable failure, connector plugin crash, or high replication lag.

### Step-by-Step Procedure
1. **Pause or Delete the Debezium Connector First**:
   CRITICAL: Stop the connector before enabling direct publishing to avoid the double-publishing hazard!
   ```powershell
   # Option 1: Pause connector (preserves replication slot position)
   Invoke-RestMethod -Uri "http://localhost:8083/connectors/events-cdc-connector/pause" -Method Put

   # Option 2: Delete connector completely (if replacing or decommissioned)
   Invoke-RestMethod -Uri "http://localhost:8083/connectors/events-cdc-connector" -Method Delete
   ```
2. **Verify Connector Is Stopped**:
   ```powershell
   Invoke-RestMethod -Uri "http://localhost:8083/connectors/events-cdc-connector/status"
   # Must return state "PAUSED" or 404 Not Found
   ```
3. **Switch Application Configuration to Direct**:
   In `application.yml` (or via environment variable `LEDGER_PUBLISH_MODE=direct`):
   ```yaml
   ledger:
     publish:
       mode: direct
   ```
4. **Deploy / Restart Backend Application**:
   Restart Spring Boot. `PublishModeConsistencyGuard` will confirm that the connector is no longer RUNNING and allow direct publishing.
5. **Check for Un-streamed Events (Replication Slot Catchup)**:
   If the connector was paused while events were being inserted, check if any events in `events` are missing from `ledger-events`:
   ```sql
   SELECT aggregate_id, version, created_at FROM events WHERE created_at > (
       SELECT MAX(processed_at) FROM audit_log
   );
   ```
   If any events were committed between connector pause and direct mode startup, trigger a manual replay or publish them directly.
6. **Manage Inactive Replication Slot**:
   If the connector was deleted or will not be resumed for a prolonged period, drop the replication slot to prevent PostgreSQL WAL disk growth:
   ```sql
   SELECT pg_drop_replication_slot('debezium_events_slot');
   ```

---

## 4. Operational Troubleshooting & Failure Modes

### 1. PostgreSQL Disk Growth (Unconsumed Replication Slot)
- **Symptom**: Postgres disk usage climbs rapidly because old WAL segments cannot be recycled.
- **Diagnosis**:
  ```sql
  SELECT slot_name, active, pg_wal_lsn_diff(pg_current_wal_lsn(), confirmed_flush_lsn) AS lag_bytes
  FROM pg_replication_slots WHERE slot_name = 'debezium_events_slot';
  ```
- **Remediation**: If Debezium connector task is down or stopped, restart Kafka Connect. If abandoning CDC permanently, drop the replication slot using `SELECT pg_drop_replication_slot('debezium_events_slot');`.

### 2. Kafka Outage Resilience Behavior
- **In CDC Mode**: Fully resilient. When Kafka goes down, PostgreSQL retains WAL segments in `debezium_events_slot`. When Kafka returns, Debezium streams all accumulated events with 0 event loss.
- **In Direct Mode**: Non-resilient. When Kafka goes down, `KafkaEventProducer` dispatch fails or times out in-memory; events committed to the database are never written to Kafka, causing permanent read model drift unless manually replayed.

### 3. Duplicate Message Delivery & Idempotency
- Kafka provides at-least-once delivery.
- Both `AccountProjectionConsumer` (via optimistic balance version checking) and `AuditConsumer` (via PostgreSQL `ON CONFLICT (aggregate_id, version) DO NOTHING` and `uq_audit_log_aggregate_version`) are 100% idempotent and gracefully drop redelivered duplicate records.
