package com.bank.ledger.api;

import com.bank.ledger.command.AccountNotFoundException;
import com.bank.ledger.command.DoubleEntryInvariantException;
import com.bank.ledger.command.InsufficientBalanceException;
import com.bank.ledger.command.InvalidCommandException;
import com.bank.ledger.eventstore.OptimisticLockingException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.stream.Collectors;

@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<DTOs.ErrorResponse> handleValidationErrors(MethodArgumentNotValidException ex) {
        String details = ex.getBindingResult().getFieldErrors().stream()
                .map(FieldError::getDefaultMessage)
                .collect(Collectors.joining("; "));
        
        DTOs.ErrorResponse error = new DTOs.ErrorResponse(
                HttpStatus.BAD_REQUEST.value(),
                "Validation Error",
                details,
                System.currentTimeMillis()
        );
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(error);
    }

    @ExceptionHandler({InsufficientBalanceException.class, InvalidCommandException.class, IllegalArgumentException.class})
    public ResponseEntity<DTOs.ErrorResponse> handleBadRequest(RuntimeException ex) {
        DTOs.ErrorResponse error = new DTOs.ErrorResponse(
                HttpStatus.BAD_REQUEST.value(),
                "Bad Request",
                ex.getMessage(),
                System.currentTimeMillis()
        );
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(error);
    }

    @ExceptionHandler(DoubleEntryInvariantException.class)
    public ResponseEntity<DTOs.ErrorResponse> handleDoubleEntryViolation(DoubleEntryInvariantException ex) {
        DTOs.ErrorResponse error = new DTOs.ErrorResponse(
                HttpStatus.UNPROCESSABLE_ENTITY.value(),
                "Double-Entry Invariant Violation",
                ex.getMessage(),
                System.currentTimeMillis()
        );
        return ResponseEntity.status(HttpStatus.UNPROCESSABLE_ENTITY).body(error);
    }

    @ExceptionHandler(AccountNotFoundException.class)
    public ResponseEntity<DTOs.ErrorResponse> handleNotFound(AccountNotFoundException ex) {
        DTOs.ErrorResponse error = new DTOs.ErrorResponse(
                HttpStatus.NOT_FOUND.value(),
                "Not Found",
                ex.getMessage(),
                System.currentTimeMillis()
        );
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(error);
    }

    @ExceptionHandler(OptimisticLockingException.class)
    public ResponseEntity<DTOs.ErrorResponse> handleOptimisticLocking(OptimisticLockingException ex) {
        DTOs.ErrorResponse error = new DTOs.ErrorResponse(
                HttpStatus.CONFLICT.value(),
                "Conflict - Optimistic Locking Error",
                ex.getMessage(),
                System.currentTimeMillis()
        );
        return ResponseEntity.status(HttpStatus.CONFLICT).body(error);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<DTOs.ErrorResponse> handleGeneralException(Exception ex) {
        DTOs.ErrorResponse error = new DTOs.ErrorResponse(
                HttpStatus.INTERNAL_SERVER_ERROR.value(),
                "Internal Server Error",
                ex.getMessage(),
                System.currentTimeMillis()
        );
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(error);
    }
}
