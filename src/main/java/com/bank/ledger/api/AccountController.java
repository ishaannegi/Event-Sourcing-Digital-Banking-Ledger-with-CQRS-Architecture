package com.bank.ledger.api;

import com.bank.ledger.command.AccountAggregate;
import com.bank.ledger.command.AccountCommandHandler;
import com.bank.ledger.command.Commands;
import com.bank.ledger.readmodel.AccountBalanceRepository;
import com.bank.ledger.readmodel.AccountCacheService;
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
