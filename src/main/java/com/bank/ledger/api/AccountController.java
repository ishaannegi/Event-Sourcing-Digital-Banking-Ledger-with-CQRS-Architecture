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

    public AccountController(AccountCommandHandler commandHandler,
                             AccountBalanceRepository accountBalanceRepository,
                             AccountCacheService accountCacheService,
                             EventStoreService eventStoreService) {
        this.commandHandler = commandHandler;
        this.accountBalanceRepository = accountBalanceRepository;
        this.accountCacheService = accountCacheService;
        this.eventStoreService = eventStoreService;
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
        // 1. Check Redis Cache (Cache-Aside)
        Optional<DTOs.AccountResponse> cachedResponse = accountCacheService.get(accountId);
        if (cachedResponse.isPresent()) {
            validateAccountOwnership(cachedResponse.get().ownerName());
            log.info("[CACHE HIT] Serving account [{}] from Redis cache", accountId);
            return ResponseEntity.ok(cachedResponse.get());
        }

        // 2. Cache Miss: Fall back to PostgreSQL Read Model
        log.info("[CACHE MISS] Querying PostgreSQL account_balances for account [{}]", accountId);
        return accountBalanceRepository.findById(accountId)
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
        List<DTOs.EventLogResponse> responseList = entities.stream()
                .map(e -> new DTOs.EventLogResponse(
                        e.getId() != null ? e.getId().toString() : null,
                        e.getAggregateId(),
                        e.getEventType(),
                        e.getPayload(),
                        e.getVersion(),
                        e.getCreatedAt()
                ))
                .toList();

        return ResponseEntity.ok(responseList);
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
