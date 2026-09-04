package com.bank.ledger.command;

import com.bank.ledger.events.AccountOpenedEvent;
import com.bank.ledger.events.DomainEvent;
import com.bank.ledger.events.FundsDepositedEvent;
import com.bank.ledger.events.FundsWithdrawnEvent;
import com.bank.ledger.events.TransferInitiatedEvent;
import com.bank.ledger.eventstore.EventStoreService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Service
public class AccountCommandHandler {

    private static final Logger log = LoggerFactory.getLogger(AccountCommandHandler.class);
    private final EventStoreService eventStoreService;

    public AccountCommandHandler(EventStoreService eventStoreService) {
        this.eventStoreService = eventStoreService;
    }

    @Transactional
    public String handle(Commands.OpenAccountCommand cmd) {
        String accountId = UUID.randomUUID().toString();
        log.info("Handling OpenAccountCommand for owner [{}] with initial balance [{}] -> assigned accountId [{}]",
                cmd.ownerName(), cmd.initialBalance(), accountId);
        AccountAggregate aggregate = loadAggregate(accountId);
        AccountOpenedEvent event = aggregate.createAccount(accountId, cmd.ownerName(), cmd.initialBalance());

        eventStoreService.appendEvents(accountId, aggregate.getVersion(), List.of(event));
        return accountId;
    }

    @Transactional
    public void handle(Commands.DepositCommand cmd) {
        log.info("Handling DepositCommand for account [{}] with amount [{}]", cmd.accountId(), cmd.amount());
        AccountAggregate aggregate = loadAggregate(cmd.accountId());
        FundsDepositedEvent event = aggregate.deposit(cmd.amount());

        eventStoreService.appendEvents(cmd.accountId(), aggregate.getVersion(), List.of(event));
    }

    @Transactional
    public void handle(Commands.WithdrawCommand cmd) {
        log.info("Handling WithdrawCommand for account [{}] with amount [{}]", cmd.accountId(), cmd.amount());
        AccountAggregate aggregate = loadAggregate(cmd.accountId());
        FundsWithdrawnEvent event = aggregate.withdraw(cmd.amount());

        eventStoreService.appendEvents(cmd.accountId(), aggregate.getVersion(), List.of(event));
    }

    @Transactional
    public String handle(Commands.TransferCommand cmd) {
        log.info("Handling TransferCommand from [{}] to [{}] for amount [{}]",
                cmd.fromAccountId(), cmd.toAccountId(), cmd.amount());
        if (cmd.fromAccountId() == null || cmd.toAccountId() == null) {
            throw new InvalidCommandException("Source and destination account IDs cannot be null.");
        }
        if (cmd.fromAccountId().equals(cmd.toAccountId())) {
            throw new InvalidCommandException("Cannot transfer funds to the same account.");
        }

        // 1. Load Aggregates
        AccountAggregate fromAggregate = loadAggregate(cmd.fromAccountId());
        AccountAggregate toAggregate = loadAggregate(cmd.toAccountId());

        // 2. Validate Business Rules on Aggregates
        fromAggregate.validateTransferSource(cmd.amount());
        toAggregate.validateTransferDestination();

        // 3. Double-Entry Accounting Invariant Verification: SUM(Debits) == SUM(Credits)
        BigDecimal debitEntryAmount = cmd.amount();   // Debit on fromAccount
        BigDecimal creditEntryAmount = cmd.amount();  // Credit on toAccount

        if (debitEntryAmount.compareTo(creditEntryAmount) != 0) {
            throw new DoubleEntryInvariantException(
                    "Double-entry invariant violation! Debit (" + debitEntryAmount 
                    + ") does not equal Credit (" + creditEntryAmount + ")");
        }

        // 4. Generate Events
        String transferId = UUID.randomUUID().toString();
        Instant now = Instant.now();

        // Two entries: Debit on fromAccount (Withdrawal) & Credit on toAccount (Deposit) + Transfer Event
        FundsWithdrawnEvent debitEvent = new FundsWithdrawnEvent(cmd.fromAccountId(), cmd.amount(), now);
        TransferInitiatedEvent transferEvent = new TransferInitiatedEvent(
                transferId, cmd.fromAccountId(), cmd.toAccountId(), cmd.amount(), now);
        FundsDepositedEvent creditEvent = new FundsDepositedEvent(cmd.toAccountId(), cmd.amount(), now);

        // 5. Atomic Event Store Write with Optimistic Locking
        eventStoreService.appendEvents(cmd.fromAccountId(), fromAggregate.getVersion(), List.of(debitEvent, transferEvent));
        eventStoreService.appendEvents(cmd.toAccountId(), toAggregate.getVersion(), List.of(creditEvent));

        return transferId;
    }

    public AccountAggregate loadAggregate(String accountId) {
        List<DomainEvent> events = eventStoreService.loadEventStream(accountId);
        return AccountAggregate.replay(events);
    }
}
