package com.bank.ledger.api;

import com.bank.ledger.command.AccountAggregate;
import com.bank.ledger.command.AccountCommandHandler;
import com.bank.ledger.command.AccountNotFoundException;
import com.bank.ledger.command.Commands;
import com.bank.ledger.readmodel.AccountBalanceRepository;
import com.bank.ledger.readmodel.AccountCacheService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.bank.ledger.eventstore.EventEntity;
import com.bank.ledger.eventstore.EventStoreService;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

@RestController
@RequestMapping("/accounts")
@Tag(name = "Account Management", description = "Endpoints for bank accounts, deposits, withdrawals, double-entry transfers, and CQRS queries")
public class AccountController {

    private static final Logger log = LoggerFactory.getLogger(AccountController.class);

    private final AccountCommandHandler commandHandler;
    private final AccountBalanceRepository accountBalanceRepository;
    private final AccountCacheService accountCacheService;
    private final EventStoreService eventStoreService;
    private final com.fasterxml.jackson.databind.ObjectMapper objectMapper;

    public AccountController(AccountCommandHandler commandHandler,
                             AccountBalanceRepository accountBalanceRepository,
                             AccountCacheService accountCacheService,
                             EventStoreService eventStoreService,
                             com.fasterxml.jackson.databind.ObjectMapper objectMapper) {
        this.commandHandler = commandHandler;
        this.accountBalanceRepository = accountBalanceRepository;
        this.accountCacheService = accountCacheService;
        this.eventStoreService = eventStoreService;
        this.objectMapper = objectMapper;
    }

    @Operation(
            summary = "Open a new bank account",
            description = "Creates a new bank account. For CUSTOMER users, the account owner is automatically bound to their authenticated username."
    )
    @ApiResponse(responseCode = "201", description = "Account created successfully")
    @ApiResponse(responseCode = "400", description = "Invalid request payload")
    @ApiResponse(responseCode = "401", description = "Missing or invalid Bearer JWT token")
    @PostMapping
    public ResponseEntity<DTOs.AccountResponse> openAccount(@Valid @RequestBody DTOs.OpenAccountRequest request) {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        boolean isAdmin = auth != null && auth.getAuthorities().stream().anyMatch(a -> a.getAuthority().equals("ROLE_ADMIN"));

        String ownerName = (isAdmin && request.ownerName() != null && !request.ownerName().isBlank())
                ? request.ownerName()
                : (auth != null ? auth.getName() : request.ownerName());

        Commands.OpenAccountCommand command = new Commands.OpenAccountCommand(ownerName, request.initialBalance());
        String accountId = commandHandler.handle(command);

        AccountAggregate aggregate = commandHandler.loadAggregate(accountId);
        DTOs.AccountResponse response = new DTOs.AccountResponse(
                aggregate.getAccountId(),
                aggregate.getOwnerName(),
                aggregate.getBalance(),
                aggregate.getVersion()
        );
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @Operation(
            summary = "Deposit funds into an account",
            description = "Deposits funds into the specified account. CUSTOMER users can only deposit into accounts they own."
    )
    @ApiResponse(responseCode = "200", description = "Deposit successful")
    @ApiResponse(responseCode = "400", description = "Invalid amount or account not active")
    @ApiResponse(responseCode = "401", description = "Missing or invalid Bearer JWT token")
    @ApiResponse(responseCode = "403", description = "Forbidden - account ownership mismatch")
    @ApiResponse(responseCode = "404", description = "Account not found")
    @PostMapping("/{id}/deposit")
    public ResponseEntity<DTOs.AccountResponse> deposit(@PathVariable("id") String accountId, @Valid @RequestBody DTOs.DepositRequest request) {
        AccountAggregate existing = commandHandler.loadAggregate(accountId);
        if (!existing.isActive()) {
            return ResponseEntity.notFound().build();
        }
        validateAccountOwnership(existing.getOwnerName());

        Commands.DepositCommand command = new Commands.DepositCommand(accountId, request.amount());
        commandHandler.handle(command);

        AccountAggregate aggregate = commandHandler.loadAggregate(accountId);
        DTOs.AccountResponse response = new DTOs.AccountResponse(
                aggregate.getAccountId(),
                aggregate.getOwnerName(),
                aggregate.getBalance(),
                aggregate.getVersion()
        );
        return ResponseEntity.ok(response);
    }

    @Operation(
            summary = "Withdraw funds from an account",
            description = "Withdraws funds after validating sufficient balance. CUSTOMER users can only withdraw from accounts they own."
    )
    @ApiResponse(responseCode = "200", description = "Withdrawal successful")
    @ApiResponse(responseCode = "400", description = "Insufficient funds or invalid amount")
    @ApiResponse(responseCode = "401", description = "Missing or invalid Bearer JWT token")
    @ApiResponse(responseCode = "403", description = "Forbidden - account ownership mismatch")
    @ApiResponse(responseCode = "404", description = "Account not found")
    @PostMapping("/{id}/withdraw")
    public ResponseEntity<DTOs.AccountResponse> withdraw(@PathVariable("id") String accountId, @Valid @RequestBody DTOs.WithdrawRequest request) {
        AccountAggregate existing = commandHandler.loadAggregate(accountId);
        if (!existing.isActive()) {
            return ResponseEntity.notFound().build();
        }
        validateAccountOwnership(existing.getOwnerName());

        Commands.WithdrawCommand command = new Commands.WithdrawCommand(accountId, request.amount());
        commandHandler.handle(command);

        AccountAggregate aggregate = commandHandler.loadAggregate(accountId);
        DTOs.AccountResponse response = new DTOs.AccountResponse(
                aggregate.getAccountId(),
                aggregate.getOwnerName(),
                aggregate.getBalance(),
                aggregate.getVersion()
        );
        return ResponseEntity.ok(response);
    }

    @Operation(
            summary = "Transfer funds between accounts (Double-Entry)",
            description = "Atomic double-entry transfer. CUSTOMER users can only initiate transfers from source accounts they own."
    )
    @ApiResponse(responseCode = "200", description = "Transfer completed successfully")
    @ApiResponse(responseCode = "400", description = "Insufficient balance or invalid transfer details")
    @ApiResponse(responseCode = "401", description = "Missing or invalid Bearer JWT token")
    @ApiResponse(responseCode = "403", description = "Forbidden - source account ownership mismatch")
    @ApiResponse(responseCode = "409", description = "Optimistic locking concurrency conflict")
    @ApiResponse(responseCode = "422", description = "Double-entry accounting invariant violation")
    @PostMapping("/transfer")
    public ResponseEntity<DTOs.TransferResponse> transfer(@Valid @RequestBody DTOs.TransferRequest request) {
        AccountAggregate fromAggregate = commandHandler.loadAggregate(request.fromAccountId());
        if (!fromAggregate.isActive()) {
            throw new AccountNotFoundException("Source account [" + request.fromAccountId() + "] not found");
        }
        validateAccountOwnership(fromAggregate.getOwnerName());

        Commands.TransferCommand command = new Commands.TransferCommand(
                request.fromAccountId(),
                request.toAccountId(),
                request.amount()
        );
        String transferId = commandHandler.handle(command);

        DTOs.TransferResponse response = new DTOs.TransferResponse(
                transferId,
                request.fromAccountId(),
                request.toAccountId(),
                request.amount(),
                "SUCCESS"
        );
        return ResponseEntity.ok(response);
    }

    @Operation(
            summary = "Get account details (Event Replay - Source of Truth)",
            description = "Rebuilds aggregate state strictly by replaying historical domain events. CUSTOMER users can only view accounts they own."
    )
    @ApiResponse(responseCode = "200", description = "Account retrieved from event store replay")
    @ApiResponse(responseCode = "401", description = "Missing or invalid Bearer JWT token")
    @ApiResponse(responseCode = "403", description = "Forbidden - account ownership mismatch")
    @ApiResponse(responseCode = "404", description = "Account not found")
    @GetMapping("/{id}")
    public ResponseEntity<DTOs.AccountResponse> getAccount(@PathVariable("id") String accountId) {
        AccountAggregate aggregate = commandHandler.loadAggregate(accountId);
        if (!aggregate.isActive()) {
            return ResponseEntity.notFound().build();
        }
        validateAccountOwnership(aggregate.getOwnerName());

        DTOs.AccountResponse response = new DTOs.AccountResponse(
                aggregate.getAccountId(),
                aggregate.getOwnerName(),
                aggregate.getBalance(),
                aggregate.getVersion()
        );
        return ResponseEntity.ok(response);
    }

    @Operation(
            summary = "Get account balance view (CQRS Fast Read - Redis & PostgreSQL)",
            description = "Queries Redis cache / PostgreSQL read model. CUSTOMER users can only view accounts they own."
    )
    @ApiResponse(responseCode = "200", description = "Account balance retrieved from cache or read model")
    @ApiResponse(responseCode = "401", description = "Missing or invalid Bearer JWT token")
    @ApiResponse(responseCode = "403", description = "Forbidden - account ownership mismatch")
    @ApiResponse(responseCode = "404", description = "Account projection not found")
    @GetMapping("/{id}/balance-view")
    public ResponseEntity<DTOs.AccountResponse> getAccountBalanceView(@PathVariable("id") String accountId) {
        long tStart = System.nanoTime();
        try {
            // 1. Check Redis Cache (Cache-Aside)
            Optional<DTOs.AccountResponse> cachedResponse = accountCacheService.get(accountId);
            if (cachedResponse.isPresent()) {
                validateAccountOwnership(cachedResponse.get().ownerName());
                long totalUs = (System.nanoTime() - tStart) / 1000;
                log.info("[SPRING MVC TIMING BREAKDOWN] Account [{}] - Total Cache-Hit Endpoint Time: {} ms ({} us)",
                        accountId, String.format("%.3f", totalUs / 1000.0), totalUs);
                return ResponseEntity.ok(cachedResponse.get());
            }

            // 2. Cache Miss: Fall back to PostgreSQL Read Model
            log.info("[CACHE MISS] Querying PostgreSQL account_balances for account [{}]", accountId);
            ResponseEntity<DTOs.AccountResponse> result = accountBalanceRepository.findById(accountId)
                    .map(entity -> {
                        validateAccountOwnership(entity.getOwnerName());
                        DTOs.AccountResponse response = new DTOs.AccountResponse(
                                entity.getAccountId(),
                                entity.getOwnerName(),
                                entity.getBalance(),
                                entity.getLastAppliedVersion()
                        );
                        // Populate Redis cache on miss
                        accountCacheService.put(accountId, response);
                        return response;
                    })
                    .map(ResponseEntity::ok)
                    .orElseGet(() -> ResponseEntity.notFound().build());

            long totalUs = (System.nanoTime() - tStart) / 1000;
            log.info("[SPRING MVC TIMING BREAKDOWN] Account [{}] - Total Cache-Miss Endpoint Time: {} ms ({} us)",
                    accountId, String.format("%.3f", totalUs / 1000.0), totalUs);
            return result;
        } catch (Exception e) {
            long totalUs = (System.nanoTime() - tStart) / 1000;
            log.info("[SPRING MVC TIMING BREAKDOWN] Account [{}] - Total Exception Endpoint Time: {} ms ({} us)",
                    accountId, String.format("%.3f", totalUs / 1000.0), totalUs);
            throw e;
        }
    }

    @Operation(
            summary = "Get raw event stream for an account",
            description = "Returns the raw event stream from the Event Store ordered by version ascending for aggregate inspection."
    )
    @ApiResponse(responseCode = "200", description = "Raw event stream retrieved successfully")
    @ApiResponse(responseCode = "401", description = "Missing or invalid Bearer JWT token")
    @ApiResponse(responseCode = "403", description = "Forbidden - account ownership mismatch")
    @ApiResponse(responseCode = "404", description = "Account aggregate not found")
    @GetMapping("/{id}/events")
    public ResponseEntity<List<DTOs.EventLogResponse>> getAccountEvents(@PathVariable("id") String accountId) {
        AccountAggregate aggregate = commandHandler.loadAggregate(accountId);
        if (!aggregate.isActive()) {
            return ResponseEntity.notFound().build();
        }
        validateAccountOwnership(aggregate.getOwnerName());

        List<EventEntity> entities = eventStoreService.loadEventEntities(accountId);
        List<DTOs.EventLogResponse> responseList = new java.util.ArrayList<>();
        java.math.BigDecimal runningBalance = java.math.BigDecimal.ZERO;

        for (EventEntity e : entities) {
            java.math.BigDecimal deltaAmount = java.math.BigDecimal.ZERO;
            try {
                com.bank.ledger.events.DomainEvent event = objectMapper.readValue(e.getPayload(), com.bank.ledger.events.DomainEvent.class);
                if (event instanceof com.bank.ledger.events.AccountOpenedEvent ev) {
                    deltaAmount = ev.getInitialBalance() != null ? ev.getInitialBalance() : java.math.BigDecimal.ZERO;
                    runningBalance = runningBalance.add(deltaAmount);
                } else if (event instanceof com.bank.ledger.events.FundsDepositedEvent ev) {
                    deltaAmount = ev.getAmount() != null ? ev.getAmount() : java.math.BigDecimal.ZERO;
                    runningBalance = runningBalance.add(deltaAmount);
                } else if (event instanceof com.bank.ledger.events.FundsWithdrawnEvent ev) {
                    deltaAmount = ev.getAmount() != null ? ev.getAmount() : java.math.BigDecimal.ZERO;
                    runningBalance = runningBalance.subtract(deltaAmount);
                } else if (event instanceof com.bank.ledger.events.TransferInitiatedEvent ev) {
                    deltaAmount = ev.getAmount() != null ? ev.getAmount() : java.math.BigDecimal.ZERO;
                }
            } catch (Exception ex) {
                log.error("Failed to parse event payload for running balance calculation: {}", ex.getMessage());
            }

            responseList.add(new DTOs.EventLogResponse(
                    e.getId() != null ? e.getId().toString() : null,
                    e.getAggregateId(),
                    e.getEventType(),
                    e.getPayload(),
                    e.getVersion(),
                    e.getCreatedAt(),
                    deltaAmount,
                    runningBalance,
                    e.getPreviousHash(),
                    e.getHash(),
                    e.getPqcSignature(),
                    e.getPqcPublicKey(),
                    e.getSignatureAlgorithm()
            ));

        }

        return ResponseEntity.ok(responseList);
    }

    @Operation(
            summary = "Get user transactions across all owned accounts",
            description = "Returns aggregated transactions across all accounts owned by the authenticated user in reverse chronological order."
    )
    @ApiResponse(responseCode = "200", description = "Transactions retrieved successfully")
    @ApiResponse(responseCode = "401", description = "Missing or invalid Bearer JWT token")
    @GetMapping("/user-transactions")
    public ResponseEntity<List<DTOs.UserTransactionResponse>> getUserTransactions(
            @org.springframework.web.bind.annotation.RequestParam(value = "accountId", required = false) String filterAccountId
    ) {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated()) {
            throw new AccessDeniedException("Full authentication is required to access this resource.");
        }

        boolean isAdmin = auth.getAuthorities().stream()
                .anyMatch(a -> a.getAuthority().equals("ROLE_ADMIN") || a.getAuthority().equals("ADMIN"));
        String currentUsername = auth.getName();

        List<com.bank.ledger.readmodel.AccountBalanceEntity> targetAccounts;
        if (filterAccountId != null && !filterAccountId.isBlank()) {
            AccountAggregate aggregate = commandHandler.loadAggregate(filterAccountId);
            if (!aggregate.isActive()) {
                return ResponseEntity.notFound().build();
            }
            validateAccountOwnership(aggregate.getOwnerName());
            com.bank.ledger.readmodel.AccountBalanceEntity dummy = new com.bank.ledger.readmodel.AccountBalanceEntity(
                    aggregate.getAccountId(), aggregate.getOwnerName(), aggregate.getBalance(), aggregate.getVersion(), java.time.Instant.now()
            );
            targetAccounts = List.of(dummy);
        } else if (isAdmin) {
            targetAccounts = accountBalanceRepository.findAll();
        } else {
            targetAccounts = accountBalanceRepository.findByOwnerNameIgnoreCase(currentUsername);
        }

        List<DTOs.UserTransactionResponse> allTx = new java.util.ArrayList<>();

        // 1. Load all TransferInitiatedEvents to establish double-entry links
        List<EventEntity> transferEntities = eventStoreService.loadAllTransferEvents();
        record TransferDescriptor(
                String transferId,
                String fromAccountId,
                String toAccountId,
                java.math.BigDecimal amount,
                java.time.Instant createdAt
        ) {}

        List<TransferDescriptor> allTransfers = new java.util.ArrayList<>();
        for (EventEntity te : transferEntities) {
            try {
                com.bank.ledger.events.DomainEvent ev = objectMapper.readValue(te.getPayload(), com.bank.ledger.events.DomainEvent.class);
                if (ev instanceof com.bank.ledger.events.TransferInitiatedEvent tie) {
                    allTransfers.add(new TransferDescriptor(
                            tie.getTransferId(),
                            tie.getFromAccountId(),
                            tie.getToAccountId(),
                            tie.getAmount(),
                            te.getCreatedAt() != null ? te.getCreatedAt() : tie.getTimestamp()
                    ));
                }
            } catch (Exception ex) {
                log.error("Failed to parse TransferInitiatedEvent payload: {}", ex.getMessage());
            }
        }

        for (com.bank.ledger.readmodel.AccountBalanceEntity acc : targetAccounts) {
            List<EventEntity> entities = eventStoreService.loadEventEntities(acc.getAccountId());
            java.math.BigDecimal runningBalance = java.math.BigDecimal.ZERO;

            for (EventEntity e : entities) {
                java.math.BigDecimal signedAmount = java.math.BigDecimal.ZERO;
                String typeLabel = e.getEventType();
                String desc = "";
                boolean skipRecord = false;

                try {
                    com.fasterxml.jackson.databind.JsonNode rootNode = objectMapper.readTree(e.getPayload());
                    if (rootNode.has("description")) {
                        desc = rootNode.path("description").asText("");
                    }

                    com.bank.ledger.events.DomainEvent event = objectMapper.readValue(e.getPayload(), com.bank.ledger.events.DomainEvent.class);
                    if (event instanceof com.bank.ledger.events.AccountOpenedEvent ev) {
                        typeLabel = "Account Opened";
                        signedAmount = ev.getInitialBalance() != null ? ev.getInitialBalance() : java.math.BigDecimal.ZERO;
                        runningBalance = runningBalance.add(signedAmount);
                        if (desc.isBlank()) desc = "Initial opening balance";
                    } else if (event instanceof com.bank.ledger.events.FundsDepositedEvent ev) {
                        java.math.BigDecimal dAmount = ev.getAmount() != null ? ev.getAmount() : java.math.BigDecimal.ZERO;
                        runningBalance = runningBalance.add(dAmount);

                        // Check if this deposit is the CREDIT leg of a double-entry transfer
                        TransferDescriptor matchedTransfer = null;
                        for (TransferDescriptor tr : allTransfers) {
                            if (acc.getAccountId().equals(tr.toAccountId())
                                    && tr.amount() != null && tr.amount().compareTo(dAmount) == 0
                                    && e.getCreatedAt() != null && tr.createdAt() != null
                                    && Math.abs(java.time.Duration.between(e.getCreatedAt(), tr.createdAt()).toSeconds()) <= 5) {
                                matchedTransfer = tr;
                                break;
                            }
                        }

                        if (matchedTransfer != null) {
                            typeLabel = "Transfer Received";
                            signedAmount = dAmount; // Positive Credit / Inflow
                            if (desc.isBlank()) desc = "Transfer from " + matchedTransfer.fromAccountId();
                        } else {
                            typeLabel = "Deposit";
                            signedAmount = dAmount;
                            if (desc.isBlank()) desc = "Account deposit";
                        }
                    } else if (event instanceof com.bank.ledger.events.FundsWithdrawnEvent ev) {
                        java.math.BigDecimal wAmount = ev.getAmount() != null ? ev.getAmount() : java.math.BigDecimal.ZERO;
                        runningBalance = runningBalance.subtract(wAmount);

                        // Check if this withdrawal was the internal debit accompanying a TransferInitiatedEvent
                        boolean isTransferDebit = false;
                        for (TransferDescriptor tr : allTransfers) {
                            if (acc.getAccountId().equals(tr.fromAccountId())
                                    && tr.amount() != null && tr.amount().compareTo(wAmount) == 0
                                    && e.getCreatedAt() != null && tr.createdAt() != null
                                    && Math.abs(java.time.Duration.between(e.getCreatedAt(), tr.createdAt()).toSeconds()) <= 5) {
                                isTransferDebit = true;
                                break;
                            }
                        }

                        if (isTransferDebit) {
                            // Handled by TransferInitiatedEvent to avoid double-counting in transactions ledger
                            skipRecord = true;
                        } else {
                            typeLabel = "Withdrawal";
                            signedAmount = wAmount.negate();
                            if (desc.isBlank()) desc = "Account withdrawal";
                        }
                    } else if (event instanceof com.bank.ledger.events.TransferInitiatedEvent ev) {
                        typeLabel = "Transfer Sent";
                        java.math.BigDecimal tAmount = ev.getAmount() != null ? ev.getAmount() : java.math.BigDecimal.ZERO;
                        signedAmount = tAmount.negate(); // Negative Debit / Outflow
                        if (desc.isBlank()) desc = "Transfer to " + ev.getToAccountId();
                    }
                } catch (Exception ex) {
                    log.error("Failed to parse event payload for transaction mapping: {}", ex.getMessage());
                }

                if (!skipRecord) {
                    allTx.add(new DTOs.UserTransactionResponse(
                            e.getId() != null ? e.getId().toString() : java.util.UUID.randomUUID().toString(),
                            e.getAggregateId(),
                            acc.getOwnerName(),
                            e.getEventType(),
                            typeLabel,
                            signedAmount,
                            runningBalance,
                            e.getCreatedAt(),
                            desc,
                            e.getVersion(),
                            e.getPreviousHash(),
                            e.getHash(),
                            e.getPqcSignature(),
                            e.getSignatureAlgorithm(),
                            e.getPayload()
                    ));
                }
            }
        }

        allTx.sort((a, b) -> b.createdAt().compareTo(a.createdAt()));

        return ResponseEntity.ok(allTx);
    }

    @Operation(
            summary = "Get customer dashboard summary",
            description = "Returns banking overview metrics and recent transactions strictly for the authenticated customer."
    )
    @ApiResponse(responseCode = "200", description = "Customer dashboard retrieved successfully")
    @ApiResponse(responseCode = "401", description = "Missing or invalid Bearer JWT token")
    @GetMapping("/customer-summary")
    public ResponseEntity<DTOs.CustomerDashboardResponse> getCustomerSummary() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated()) {
            throw new AccessDeniedException("Full authentication is required to access this resource.");
        }

        String username = auth.getName();
        List<com.bank.ledger.readmodel.AccountBalanceEntity> accounts = accountBalanceRepository.findByOwnerNameIgnoreCase(username);

        BigDecimal totalBalance = accounts.stream()
                .map(com.bank.ledger.readmodel.AccountBalanceEntity::getBalance)
                .filter(java.util.Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        ResponseEntity<List<DTOs.UserTransactionResponse>> txResp = getUserTransactions(null);
        List<DTOs.UserTransactionResponse> allTx = txResp.getBody() != null ? txResp.getBody() : List.of();

        BigDecimal totalInflow = BigDecimal.ZERO;
        BigDecimal totalOutflow = BigDecimal.ZERO;
        for (DTOs.UserTransactionResponse tx : allTx) {
            BigDecimal amt = tx.amount() != null ? tx.amount() : BigDecimal.ZERO;
            if (amt.compareTo(BigDecimal.ZERO) > 0) {
                totalInflow = totalInflow.add(amt);
            } else if (amt.compareTo(BigDecimal.ZERO) < 0) {
                totalOutflow = totalOutflow.add(amt.abs());
            }
        }

        BigDecimal netCashFlow = totalInflow.subtract(totalOutflow);
        List<DTOs.UserTransactionResponse> recentTx = allTx.stream().limit(8).toList();

        return ResponseEntity.ok(new DTOs.CustomerDashboardResponse(
                totalBalance,
                accounts.size(),
                totalInflow,
                totalOutflow,
                netCashFlow,
                recentTx,
                java.time.Instant.now()
        ));
    }

    private void validateAccountOwnership(String accountOwnerName) {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated()) {
            throw new AccessDeniedException("Full authentication is required to access this resource.");
        }

        boolean isAdmin = auth.getAuthorities().stream()
                .anyMatch(a -> a.getAuthority().equals("ROLE_ADMIN"));

        if (!isAdmin) {
            String currentUsername = auth.getName();
            if (accountOwnerName == null || !accountOwnerName.equalsIgnoreCase(currentUsername)) {
                throw new AccessDeniedException("Access denied: You do not have permission to access accounts owned by '" + accountOwnerName + "'");
            }
        }
    }
}
