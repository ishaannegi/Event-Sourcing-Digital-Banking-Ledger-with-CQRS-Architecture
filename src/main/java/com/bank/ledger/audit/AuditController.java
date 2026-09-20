package com.bank.ledger.audit;

import com.bank.ledger.api.DTOs;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;

@RestController
@RequestMapping("/audit")
@Tag(name = "Audit & Compliance", description = "ADMIN-only endpoints for point-in-time state reconstruction and regulatory reporting")
@PreAuthorize("hasRole('ADMIN')")
public class AuditController {

    private final AuditComplianceService auditComplianceService;

    public AuditController(AuditComplianceService auditComplianceService) {
        this.auditComplianceService = auditComplianceService;
    }

    @Operation(
            summary = "Point-In-Time Balance Reconstruction (ADMIN Only)",
            description = "Replays historical events from the append-only audit_log table up to the specified ISO-8601 timestamp to reconstruct account balance and version as of that moment."
    )
    @ApiResponse(responseCode = "200", description = "Historical balance reconstructed successfully")
    @ApiResponse(responseCode = "401", description = "Missing or invalid Bearer JWT token")
    @ApiResponse(responseCode = "403", description = "Forbidden - ADMIN role required")
    @ApiResponse(responseCode = "404", description = "Account not found in audit trail")
    @GetMapping("/accounts/{id}/balance-at")
    public ResponseEntity<DTOs.HistoricalBalanceResponse> getBalanceAt(
            @PathVariable("id") String accountId,
            @Parameter(description = "ISO-8601 Timestamp (e.g. 2026-09-06T20:00:00Z)", example = "2026-09-06T20:00:00Z")
            @RequestParam("timestamp") @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant timestamp) {

        DTOs.HistoricalBalanceResponse response = auditComplianceService.reconstructBalanceAt(accountId, timestamp);
        return ResponseEntity.ok(response);
    }

    @Operation(
            summary = "Cryptographic Event Hash Chain Verification (ADMIN Only)",
            description = "Validates the sequential SHA3-512 cryptographic hash chain across all aggregate events for an account to detect any unauthorized database row tampering or payload modification."
    )
    @ApiResponse(responseCode = "200", description = "Hash chain verified (status VALID or TAMPERED)")
    @ApiResponse(responseCode = "401", description = "Missing or invalid Bearer JWT token")
    @ApiResponse(responseCode = "403", description = "Forbidden - ADMIN role required")
    @ApiResponse(responseCode = "404", description = "Account not found in event store")
    @GetMapping("/accounts/{id}/verify-chain")
    public ResponseEntity<DTOs.EventChainVerificationResponse> verifyChain(@PathVariable("id") String accountId) {
        DTOs.EventChainVerificationResponse response = auditComplianceService.verifyEventChain(accountId);
        return ResponseEntity.ok(response);
    }

    @Operation(
            summary = "Regulatory Compliance Report (ADMIN Only)",
            description = "Computes summary metrics (total transactions, total financial volume, per-account counts) strictly from the tamper-evident audit_log table for the specified date range."
    )
    @ApiResponse(responseCode = "200", description = "Regulatory report generated successfully")
    @ApiResponse(responseCode = "401", description = "Missing or invalid Bearer JWT token")
    @ApiResponse(responseCode = "403", description = "Forbidden - ADMIN role required")
    @GetMapping("/report")
    public ResponseEntity<DTOs.RegulatoryReportResponse> getRegulatoryReport(
            @Parameter(description = "Start ISO-8601 Timestamp", example = "2026-09-01T00:00:00Z")
            @RequestParam("from") @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant from,
            @Parameter(description = "End ISO-8601 Timestamp", example = "2026-09-30T23:59:59Z")
            @RequestParam("to") @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant to) {

        DTOs.RegulatoryReportResponse response = auditComplianceService.generateRegulatoryReport(from, to);
        return ResponseEntity.ok(response);
    }

    @Operation(
            summary = "DEMO ONLY - Simulate SQL Payload Tampering (ADMIN Only)",
            description = "Directly alters an event's JSON payload in the PostgreSQL events table without updating hashes or signatures to simulate SQL tampering outside normal application write path."
    )
    @ApiResponse(responseCode = "200", description = "SQL payload tampering simulated successfully")
    @org.springframework.web.bind.annotation.PostMapping("/demo/tamper/{eventId}")
    public ResponseEntity<DTOs.TamperDemoResponse> tamperDemoEvent(@PathVariable("eventId") java.util.UUID eventId) {
        DTOs.TamperDemoResponse response = auditComplianceService.tamperEventPayload(eventId);
        return ResponseEntity.ok(response);
    }

    @Operation(
            summary = "DEMO ONLY - Restore Original Event Payload (ADMIN Only)",
            description = "Reverts tampered event payload back to original signed JSON payload stored in tamper_demo_backups database table."
    )
    @ApiResponse(responseCode = "200", description = "Original event payload restored successfully")
    @org.springframework.web.bind.annotation.PostMapping("/demo/restore/{eventId}")
    public ResponseEntity<DTOs.TamperDemoResponse> restoreDemoEvent(@PathVariable("eventId") java.util.UUID eventId) {
        DTOs.TamperDemoResponse response = auditComplianceService.restoreEventPayload(eventId);
        return ResponseEntity.ok(response);
    }

    @Operation(
            summary = "DEMO ONLY - Restore All Tampered Events for an Account (ADMIN Only)",
            description = "Reverts all tampered event payloads for an account back to original signed JSON payloads stored in tamper_demo_backups database table."
    )
    @ApiResponse(responseCode = "200", description = "All tampered account events restored successfully")
    @org.springframework.web.bind.annotation.PostMapping("/demo/restore-account/{accountId}")
    public ResponseEntity<DTOs.TamperDemoResponse> restoreDemoAccount(@PathVariable("accountId") String accountId) {
        DTOs.TamperDemoResponse response = auditComplianceService.restoreAccountEvents(accountId);
        return ResponseEntity.ok(response);
    }
}


