package com.bank.ledger.security;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.security.KeyPair;

import static org.junit.jupiter.api.Assertions.*;

class PqcSecurityTest {

    private PqcKeyManagementService pqcKeyManagementService;

    @BeforeEach
    void setUp() {
        pqcKeyManagementService = new PqcKeyManagementService();
    }

    @Test
    @DisplayName("Generate ML-DSA / Dilithium3 KeyPair and verify valid signature")
    void testSignAndVerify() {
        KeyPair keyPair = pqcKeyManagementService.generateKeyPair();
        assertNotNull(keyPair.getPublic());
        assertNotNull(keyPair.getPrivate());

        String data = "GENESIS_000:acc-101:AccountOpenedEvent:1:{\"initialBalance\":5000.00}";
        String signatureBase64 = pqcKeyManagementService.sign(keyPair.getPrivate(), data);

        assertNotNull(signatureBase64);
        assertFalse(signatureBase64.isBlank());

        boolean isVerified = pqcKeyManagementService.verify(keyPair.getPublic(), data, signatureBase64);
        assertTrue(isVerified, "PQC signature should verify successfully against original data");
    }

    @Test
    @DisplayName("PQC Signature verification fails if data is tampered")
    void testTamperedDataSignatureFails() {
        KeyPair keyPair = pqcKeyManagementService.generateKeyPair();
        String originalData = "GENESIS_000:acc-101:FundsDepositedEvent:2:{\"amount\":500.00}";
        String tamperedData = "GENESIS_000:acc-101:FundsDepositedEvent:2:{\"amount\":50000.00}";

        String signatureBase64 = pqcKeyManagementService.sign(keyPair.getPrivate(), originalData);

        boolean isVerified = pqcKeyManagementService.verify(keyPair.getPublic(), tamperedData, signatureBase64);
        assertFalse(isVerified, "PQC signature verification MUST fail when payload is tampered");
    }

    @Test
    @DisplayName("Public key encoding and decoding maintains cryptographic validity")
    void testPublicKeyEncodeDecode() {
        KeyPair keyPair = pqcKeyManagementService.generateKeyPair();
        String encodedKey = pqcKeyManagementService.encodePublicKey(keyPair.getPublic());
        assertNotNull(encodedKey);

        var decodedPubKey = pqcKeyManagementService.decodePublicKey(encodedKey);
        assertNotNull(decodedPubKey);

        String data = "test_event_data_stream";
        String sig = pqcKeyManagementService.sign(keyPair.getPrivate(), data);

        boolean isVerified = pqcKeyManagementService.verify(decodedPubKey, data, sig);
        assertTrue(isVerified, "Decoded public key must successfully verify signatures");
    }
}
