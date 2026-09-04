package com.bank.ledger.api;

import com.bank.ledger.command.AccountAggregate;
import com.bank.ledger.command.AccountCommandHandler;
import com.bank.ledger.command.Commands;
import com.bank.ledger.readmodel.AccountBalanceRepository;
import com.bank.ledger.readmodel.AccountCacheService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Optional;

@RestController
@RequestMapping("/accounts")
@Tag(name = "Account Management", description = "Endpoints for bank accounts, deposits, withdrawals, double-entry transfers, and CQRS queries")
public class AccountController {

    private static final Logger log = LoggerFactory.getLogger(AccountController.class);

    private final AccountCommandHandler commandHandler;
    private final AccountBalanceRepository accountBalanceRepository;
    private final AccountCacheService accountCacheService;

    public AccountController(AccountCommandHandler commandHandler,
                             AccountBalanceRepository accountBalanceRepository,
                             AccountCacheService accountCacheService) {
        this.commandHandler = commandHandler;
        this.accountBalanceRepository = accountBalanceRepository;
        this.accountCacheService = accountCacheService;
    }

    @Operation(
            summary = "Open a new bank account",
            description = "Creates a new bank account with owner name and initial balance. Appends an AccountOpenedEvent to the event store."
    )
    @ApiResponse(responseCode = "201", description = "Account created successfully")
    @ApiResponse(responseCode = "400", description = "Invalid request payload")
    @PostMapping
    public ResponseEntity<DTOs.AccountResponse> openAccount(@Valid @RequestBody DTOs.OpenAccountRequest request) {
        Commands.OpenAccountCommand command = new Commands.OpenAccountCommand(request.ownerName(), request.initialBalance());
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
            description = "Deposits the specified amount into the account. Appends a FundsDepositedEvent."
    )
    @ApiResponse(responseCode = "200", description = "Deposit successful")
    @ApiResponse(responseCode = "400", description = "Invalid amount or account not active")
    @ApiResponse(responseCode = "404", description = "Account not found")
    @PostMapping("/{id}/deposit")
    public ResponseEntity<DTOs.AccountResponse> deposit(@PathVariable("id") String accountId, @Valid @RequestBody DTOs.DepositRequest request) {
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
            description = "Withdraws funds after validating sufficient balance via aggregate event replay. Appends a FundsWithdrawnEvent."
    )
    @ApiResponse(responseCode = "200", description = "Withdrawal successful")
    @ApiResponse(responseCode = "400", description = "Insufficient funds or invalid amount")
    @ApiResponse(responseCode = "404", description = "Account not found")
    @PostMapping("/{id}/withdraw")
    public ResponseEntity<DTOs.AccountResponse> withdraw(@PathVariable("id") String accountId, @Valid @RequestBody DTOs.WithdrawRequest request) {
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
            description = "Atomic double-entry transfer. Enforces SUM(debits) == SUM(credits) invariant, producing FundsWithdrawnEvent (Debit), TransferInitiatedEvent, and FundsDepositedEvent (Credit)."
    )
    @ApiResponse(responseCode = "200", description = "Transfer completed successfully")
    @ApiResponse(responseCode = "400", description = "Insufficient balance or invalid transfer details")
    @ApiResponse(responseCode = "422", description = "Double-entry accounting invariant violation")
    @ApiResponse(responseCode = "409", description = "Optimistic locking concurrency conflict")
    @PostMapping("/transfer")
    public ResponseEntity<DTOs.TransferResponse> transfer(@Valid @RequestBody DTOs.TransferRequest request) {
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

    /**
     * Source of Truth Query Endpoint (Event Replay Path)
     */
    @Operation(
            summary = "Get account details (Event Replay - Source of Truth)",
            description = "Rebuilds aggregate state strictly by replaying all historical domain events in sequence from PostgreSQL."
    )
    @ApiResponse(responseCode = "200", description = "Account retrieved from event store replay")
    @ApiResponse(responseCode = "404", description = "Account not found")
    @GetMapping("/{id}")
    public ResponseEntity<DTOs.AccountResponse> getAccount(@PathVariable("id") String accountId) {
        AccountAggregate aggregate = commandHandler.loadAggregate(accountId);
        if (!aggregate.isActive()) {
            return ResponseEntity.notFound().build();
        }
        DTOs.AccountResponse response = new DTOs.AccountResponse(
                aggregate.getAccountId(),
                aggregate.getOwnerName(),
                aggregate.getBalance(),
                aggregate.getVersion()
        );
        return ResponseEntity.ok(response);
    }

    /**
     * Fast Path CQRS Read Model Query Endpoint (Cache-Aside Pattern)
     * 1. Check Redis Cache
     * 2. On Miss: Fall back to PostgreSQL account_balances, populate Redis, and return.
     */
    @Operation(
            summary = "Get account balance view (CQRS Fast Read - Redis & PostgreSQL)",
            description = "Queries Redis cache first (Cache-Aside). On miss, queries PostgreSQL account_balances projection table, populates Redis, and returns result."
    )
    @ApiResponse(responseCode = "200", description = "Account balance retrieved from cache or read model")
    @ApiResponse(responseCode = "404", description = "Account projection not found")
    @GetMapping("/{id}/balance-view")
    public ResponseEntity<DTOs.AccountResponse> getAccountBalanceView(@PathVariable("id") String accountId) {
        // 1. Check Redis Cache (Cache-Aside)
        Optional<DTOs.AccountResponse> cachedResponse = accountCacheService.get(accountId);
        if (cachedResponse.isPresent()) {
            log.info("[CACHE HIT] Serving account [{}] from Redis cache", accountId);
            return ResponseEntity.ok(cachedResponse.get());
        }

        // 2. Cache Miss: Fall back to PostgreSQL Read Model
        log.info("[CACHE MISS] Querying PostgreSQL account_balances for account [{}]", accountId);
        return accountBalanceRepository.findById(accountId)
                .map(entity -> {
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
}
