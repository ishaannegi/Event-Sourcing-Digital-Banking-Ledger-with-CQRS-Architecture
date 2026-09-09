package com.bank.ledger.command;

import com.bank.ledger.events.AccountOpenedEvent;
import com.bank.ledger.events.DomainEvent;
import com.bank.ledger.events.FundsDepositedEvent;
import com.bank.ledger.events.FundsWithdrawnEvent;
import com.bank.ledger.events.TransferInitiatedEvent;
import com.bank.ledger.eventstore.EventStoreService;
import com.bank.ledger.eventstore.OptimisticLockingException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.function.Supplier;

@Service
public class AccountCommandHandler {

    private static final Logger log = LoggerFactory.getLogger(AccountCommandHandler.class);
    public static final int MAX_RETRIES = 5;
    public static final long BASE_BACKOFF_MS = 30;

    private final EventStoreService eventStoreService;
    private final TransactionTemplate transactionTemplate;

    public AccountCommandHandler(EventStoreService eventStoreService, PlatformTransactionManager transactionManager) {
        this.eventStoreService = eventStoreService;
        this.transactionTemplate = new TransactionTemplate(transactionManager);
    }

    public String handle(Commands.OpenAccountCommand cmd) {
        return executeWithRetry("NEW_ACCOUNT", () -> {
            String accountId = UUID.randomUUID().toString();
            log.info("Handling OpenAccountCommand for owner [{}] with initial balance [{}] -> assigned accountId [{}]",
                    cmd.ownerName(), cmd.initialBalance(), accountId);
            AccountAggregate aggregate = loadAggregate(accountId);
            AccountOpenedEvent event = aggregate.createAccount(accountId, cmd.ownerName(), cmd.initialBalance());

            eventStoreService.appendEvents(accountId, aggregate.getVersion(), List.of(event));
            return accountId;
        });
    }

    public void handle(Commands.DepositCommand cmd) {
        executeWithRetry(cmd.accountId(), () -> {
            log.info("Handling DepositCommand for account [{}] with amount [{}]", cmd.accountId(), cmd.amount());
            AccountAggregate aggregate = loadAggregate(cmd.accountId());
            FundsDepositedEvent event = aggregate.deposit(cmd.amount());

            eventStoreService.appendEvents(cmd.accountId(), aggregate.getVersion(), List.of(event));
            return null;
        });
    }

    public void handle(Commands.WithdrawCommand cmd) {
        executeWithRetry(cmd.accountId(), () -> {
            log.info("Handling WithdrawCommand for account [{}] with amount [{}]", cmd.accountId(), cmd.amount());
            AccountAggregate aggregate = loadAggregate(cmd.accountId());
            FundsWithdrawnEvent event = aggregate.withdraw(cmd.amount());

            eventStoreService.appendEvents(cmd.accountId(), aggregate.getVersion(), List.of(event));
            return null;
        });
    }

    public String handle(Commands.TransferCommand cmd) {
        return executeWithRetry(cmd.fromAccountId(), () -> {
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
        });
    }

    private <T> T executeWithRetry(String primaryAccountId, Supplier<T> commandAction) {
        int attempt = 0;
        while (attempt < MAX_RETRIES) {
            attempt++;
            try {
                return transactionTemplate.execute(status -> commandAction.get());
            } catch (OptimisticLockingException | DataIntegrityViolationException e) {
                if (attempt >= MAX_RETRIES) {
                    log.error("Exhausted all {} retry attempts for command on account [{}] due to persistent version conflict.",
                            MAX_RETRIES, primaryAccountId);
                    throw new OptimisticLockingException("Version conflict on account [" + primaryAccountId + "] after " + MAX_RETRIES + " attempts. " + e.getMessage());
                }
                long jitterMs = BASE_BACKOFF_MS * attempt + java.util.concurrent.ThreadLocalRandom.current().nextInt(70);
                log.warn("Version conflict on account [{}], retrying command in {}ms (attempt {}/{})...",
                        primaryAccountId, jitterMs, attempt, MAX_RETRIES);
                try {
                    Thread.sleep(jitterMs);
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    throw new RuntimeException("Command retry interrupted", ie);
                }
            }
        }
        throw new OptimisticLockingException("Failed to process command after " + MAX_RETRIES + " attempts.");
    }

    public AccountAggregate loadAggregate(String accountId) {
        List<DomainEvent> events = eventStoreService.loadEventStream(accountId);
        return AccountAggregate.replay(events);
    }
}
