# Event-Sourced Digital Banking Ledger with CQRS Architecture

A enterprise-grade, high-throughput Digital Banking Ledger built with **Spring Boot 3**, **PostgreSQL**, **Apache Kafka**, and **Redis**, implementing **Event Sourcing**, **CQRS (Command Query Responsibility Segregation)**, and **Double-Entry Accounting**.

---

## 🏛️ System Architecture

```mermaid
flowchart TD
    subgraph Client Layer
        C[Client / Postman / Swagger UI]
    end

    subgraph Command Side (Write Path)
        CTRL[AccountController / REST API]
        CH[AccountCommandHandler]
        AGG[Account Aggregate]
        ES[EventStoreService]
        PG_EVENT[(PostgreSQL Event Store)]
    end

    subgraph Event Streaming
        KP[KafkaEventProducer]
        KAFKA{{Apache Kafka Topic: ledger.events}}
    end

    subgraph Read Side (CQRS Query Path)
        PC[AccountProjectionConsumer]
        PG_READ[(PostgreSQL Read Model: account_balances)]
        REDIS[(Redis Cache)]
    end

    C -->|HTTP REST Commands| CTRL
    CTRL -->|Commands| CH
    CH -->|Replay Event Stream| AGG
    AGG -->|Validate Invariants| CH
    CH -->|Atomic Write| ES
    ES -->|Append Events & Optimistic Lock| PG_EVENT
    ES -->|Post-Commit Publish| KP
    KP -->|Produce Event| KAFKA
    KAFKA -->|Consume Event| PC
    PC -->|Update Read Model| PG_READ
    PC -->|Write-Through Cache| REDIS
    C -->|GET /accounts/{id} Event Replay| CTRL
    C -->|GET /accounts/{id}/balance-view CQRS Read| CTRL
    CTRL -->|Read Cache| REDIS
    CTRL -->|Fallback Miss| PG_READ
```

---

## 🚀 Key Features & Principles

1. **Event Sourcing & Immutable Ledger**:
   - Accounts have no mutable `balance` table on the write side.
   - Account state is reconstructed on-demand by replaying ordered, immutable domain events (`AccountOpened`, `FundsDeposited`, `FundsWithdrawn`, `TransferInitiated`) from PostgreSQL.

2. **Double-Entry Accounting Invariant**:
   - Transfers generate a **Debit** entry on the source account and a **Credit** entry on the destination account.
   - Enforces `SUM(Debits) == SUM(Credits)` atomically within the event append transaction. If the invariant fails, the transaction rolls back.

3. **Optimistic Concurrency Control**:
   - Uses an aggregate `version` column and `(aggregate_id, version)` unique constraint in PostgreSQL to detect and reject concurrent modifications with HTTP 409 Conflict.

4. **CQRS Architecture**:
   - **Command Path**: Appends events to PostgreSQL event store.
   - **Read Path**: Asynchronously updates `account_balances` view via Kafka listeners and populates Redis Cache-Aside layer.

5. **Observability & Request Tracing**:
   - Servlet filter attaches/generates `X-Correlation-ID` to SLF4J MDC.
   - Correlation IDs are forwarded via Kafka record headers to trace requests across controllers, command handlers, Kafka events, and cache updates.

---

## 🛠️ Technology Stack

- **Core Framework**: Java 17, Spring Boot 3.3.0
- **Database (Event Store & Read Model)**: PostgreSQL 16
- **Database Migrations**: Flyway
- **Event Streaming**: Apache Kafka
- **Caching Layer**: Redis
- **Documentation & UI**: Springdoc OpenAPI / Swagger UI
- **Health & Monitoring**: Spring Boot Actuator
- **Logging**: SLF4J with MDC Correlation IDs

---

## ⚡ How to Run Locally

### Prerequisites
- Docker & Docker Compose
- Java 17+
- Maven 3.8+

### 1. Start Infrastructure (PostgreSQL, Kafka, Zookeeper, Redis)
```bash
docker compose up -d
```

Verify containers are healthy:
```bash
docker compose ps
```

### 2. Run the Application
```bash
mvn spring-boot:run
```

The application will start on `http://localhost:8080`.

---

## 🔍 Health Checks & API Documentation

- **Swagger UI (Interactive API Tester)**:  
  [http://localhost:8080/swagger-ui.html](http://localhost:8080/swagger-ui.html)

- **Actuator Infrastructure Health Check**:  
  `GET http://localhost:8080/actuator/health`  
  *Returns connection status for PostgreSQL, Kafka, and Redis in one screen.*

---

## 📡 API Reference & Verification Examples

### 1. Open a New Account
```bash
curl -X POST http://localhost:8080/accounts \
  -H "Content-Type: application/json" \
  -d '{
    "ownerName": "Alice Smith",
    "initialBalance": 1000.00
  }'
```

**Response (HTTP 201 Created):**
```json
{
  "accountId": "a1b2c3d4-5678-90ab-cdef-1234567890ab",
  "ownerName": "Alice Smith",
  "balance": 1000.00,
  "version": 1
}
```

---

### 2. Deposit Funds
```bash
curl -X POST http://localhost:8080/accounts/a1b2c3d4-5678-90ab-cdef-1234567890ab/deposit \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 250.00
  }'
```

**Response (HTTP 200 OK):**
```json
{
  "accountId": "a1b2c3d4-5678-90ab-cdef-1234567890ab",
  "ownerName": "Alice Smith",
  "balance": 1250.00,
  "version": 2
}
```

---

### 3. Withdraw Funds
```bash
curl -X POST http://localhost:8080/accounts/a1b2c3d4-5678-90ab-cdef-1234567890ab/withdraw \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 100.00
  }'
```

**Response (HTTP 200 OK):**
```json
{
  "accountId": "a1b2c3d4-5678-90ab-cdef-1234567890ab",
  "ownerName": "Alice Smith",
  "balance": 1150.00,
  "version": 3
}
```

---

### 4. Execute Double-Entry Transfer
```bash
curl -X POST http://localhost:8080/accounts/transfer \
  -H "Content-Type: application/json" \
  -d '{
    "fromAccountId": "a1b2c3d4-5678-90ab-cdef-1234567890ab",
    "toAccountId": "b2c3d4e5-6789-01bc-def0-2345678901bc",
    "amount": 300.00
  }'
```

**Response (HTTP 200 OK):**
```json
{
  "transferId": "98765432-abcd-ef01-2345-678901234567",
  "fromAccountId": "a1b2c3d4-5678-90ab-cdef-1234567890ab",
  "toAccountId": "b2c3d4e5-6789-01bc-def0-2345678901bc",
  "amount": 300.00,
  "status": "SUCCESS"
}
```

---

### 5. Source of Truth Query (Event Replay Path)
```bash
curl -X GET http://localhost:8080/accounts/a1b2c3d4-5678-90ab-cdef-1234567890ab
```

---

### 6. CQRS Fast Read Path (Redis / PostgreSQL Projection)
```bash
curl -X GET http://localhost:8080/accounts/a1b2c3d4-5678-90ab-cdef-1234567890ab/balance-view
```

---

## 🧪 Verification & Invariant Testing

### Double-Entry Accounting Invariant
Attempting a transfer with an invalid or insufficient amount will trigger business validation and fail without appending partial events:
- Debit = $300 (Withdrawal from Source)
- Credit = $300 (Deposit into Destination)
- **Invariant**: `SUM(Debits) == SUM(Credits)` enforced before persistence.

### Optimistic Concurrency Control
Concurrent transactions attempting to modify an account with an outdated version fail gracefully with HTTP 409 Conflict (`OptimisticLockingException`), preventing lost updates and race conditions.
