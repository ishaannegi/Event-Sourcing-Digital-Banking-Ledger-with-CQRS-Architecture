package com.bank.ledger.api;

import com.bank.ledger.command.AccountAggregate;
import com.bank.ledger.command.AccountCommandHandler;
import com.bank.ledger.command.Commands;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/accounts")
public class AccountController {

    private final AccountCommandHandler commandHandler;

    public AccountController(AccountCommandHandler commandHandler) {
        this.commandHandler = commandHandler;
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
}
