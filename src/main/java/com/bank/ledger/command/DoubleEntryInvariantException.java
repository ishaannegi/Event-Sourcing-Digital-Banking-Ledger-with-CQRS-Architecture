package com.bank.ledger.command;

public class DoubleEntryInvariantException extends RuntimeException {
    public DoubleEntryInvariantException(String message) {
        super(message);
    }
}
