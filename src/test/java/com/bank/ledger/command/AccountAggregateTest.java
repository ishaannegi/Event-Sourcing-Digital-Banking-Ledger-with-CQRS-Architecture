package com.bank.ledger.command;

import com.bank.ledger.events.AccountOpenedEvent;
import com.bank.ledger.events.DomainEvent;
import com.bank.ledger.events.FundsDepositedEvent;
import com.bank.ledger.events.FundsWithdrawnEvent;
import com.bank.ledger.events.TransferInitiatedEvent;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class AccountAggregateTest {

    @Test
    @DisplayName("Replay correctly rebuilds balance and version from event stream")
    void testReplayRebuildsBalanceAndVersion() {
        String accountId = "acc-123";
        Instant now = Instant.now();

        List<DomainEvent> history = List.of(
                new AccountOpenedEvent(accountId, "Alice", new BigDecimal("1000.00"), now),
                new FundsDepositedEvent(accountId, new BigDecimal("500.00"), now),
                new FundsWithdrawnEvent(accountId, new BigDecimal("200.00"), now)
        );

        AccountAggregate aggregate = AccountAggregate.replay(history);

        assertEquals(accountId, aggregate.getAccountId());
        assertEquals("Alice", aggregate.getOwnerName());
        assertEquals(new BigDecimal("1300.00"), aggregate.getBalance());
        assertEquals(3, aggregate.getVersion());
        assertTrue(aggregate.isActive());
    }

    @Test
    @DisplayName("Insufficient balance rejects withdrawal before event creation")
    void testInsufficientBalanceRejectsWithdrawal() {
        String accountId = "acc-123";
        Instant now = Instant.now();

        List<DomainEvent> history = List.of(
                new AccountOpenedEvent(accountId, "Alice", new BigDecimal("100.00"), now)
        );

        AccountAggregate aggregate = AccountAggregate.replay(history);

        assertThrows(InsufficientBalanceException.class, () -> {
            aggregate.withdraw(new BigDecimal("150.00"));
        });

        // Balance remains untouched
        assertEquals(new BigDecimal("100.00"), aggregate.getBalance());
        assertEquals(1, aggregate.getVersion());
    }

    @Test
    @DisplayName("Insufficient balance rejects transfer source before event creation")
    void testInsufficientBalanceRejectsTransferSource() {
        String accountId = "acc-123";
        Instant now = Instant.now();

        List<DomainEvent> history = List.of(
                new AccountOpenedEvent(accountId, "Alice", new BigDecimal("50.00"), now)
        );

        AccountAggregate aggregate = AccountAggregate.replay(history);

        assertThrows(InsufficientBalanceException.class, () -> {
            aggregate.validateTransferSource(new BigDecimal("100.00"));
        });
    }

    @Test
    @DisplayName("Double-entry invariant holds after a transfer (Debit == Credit)")
    void testDoubleEntryInvariantHoldsAfterTransfer() {
        String aliceId = "acc-alice";
        String bobId = "acc-bob";
        Instant now = Instant.now();

        BigDecimal transferAmount = new BigDecimal("250.00");

        // Alice starts with 500, Bob starts with 200
        AccountAggregate alice = AccountAggregate.replay(List.of(
                new AccountOpenedEvent(aliceId, "Alice", new BigDecimal("500.00"), now)
        ));
        AccountAggregate bob = AccountAggregate.replay(List.of(
                new AccountOpenedEvent(bobId, "Bob", new BigDecimal("200.00"), now)
        ));

        // Create Debit event for Alice and Credit event for Bob
        FundsWithdrawnEvent debitEvent = new FundsWithdrawnEvent(aliceId, transferAmount, now);
        FundsDepositedEvent creditEvent = new FundsDepositedEvent(bobId, transferAmount, now);

        // Verify debit and credit amounts are strictly equal
        assertEquals(debitEvent.getAmount(), creditEvent.getAmount(), "Debit amount must equal Credit amount");

        // Apply events to aggregates
        alice.apply(debitEvent);
        bob.apply(creditEvent);

        assertEquals(new BigDecimal("250.00"), alice.getBalance());
        assertEquals(new BigDecimal("450.00"), bob.getBalance());

        // Total money across system remains constant (700)
        assertEquals(new BigDecimal("700.00"), alice.getBalance().add(bob.getBalance()));
    }

    @Test
    @DisplayName("Zero and negative amounts are rejected for deposit and withdrawal")
    void testZeroAndNegativeAmountsRejected() {
        String accountId = "acc-123";
        Instant now = Instant.now();

        AccountAggregate aggregate = AccountAggregate.replay(List.of(
                new AccountOpenedEvent(accountId, "Alice", new BigDecimal("500.00"), now)
        ));

        // Zero deposit
        assertThrows(InvalidCommandException.class, () -> aggregate.deposit(BigDecimal.ZERO));
        // Negative deposit
        assertThrows(InvalidCommandException.class, () -> aggregate.deposit(new BigDecimal("-50.00")));
        // Zero withdrawal
        assertThrows(InvalidCommandException.class, () -> aggregate.withdraw(BigDecimal.ZERO));
        // Negative withdrawal
        assertThrows(InvalidCommandException.class, () -> aggregate.withdraw(new BigDecimal("-50.00")));
    }
}
