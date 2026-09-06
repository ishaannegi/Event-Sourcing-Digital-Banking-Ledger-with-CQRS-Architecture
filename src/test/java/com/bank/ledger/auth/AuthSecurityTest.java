package com.bank.ledger.auth;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

import static org.junit.jupiter.api.Assertions.*;

class AuthSecurityTest {

    @Test
    @DisplayName("BCrypt password encoder matches seeded credentials")
    void testBCryptMatches() {
        PasswordEncoder encoder = new BCryptPasswordEncoder();

        String adminHash = encoder.encode("admin123");
        String aliceHash = encoder.encode("alice123");
        String bobHash = encoder.encode("bob123");

        System.out.println("ADMIN_HASH: " + adminHash);
        System.out.println("ALICE_HASH: " + aliceHash);
        System.out.println("BOB_HASH: " + bobHash);

        assertTrue(encoder.matches("admin123", adminHash));
        assertTrue(encoder.matches("alice123", aliceHash));
        assertTrue(encoder.matches("bob123", bobHash));
    }

    @Test
    @DisplayName("JwtTokenProvider generates and validates JWT claims correctly")
    void testJwtTokenProvider() {
        JwtTokenProvider provider = new JwtTokenProvider(
                "DigitalBankingLedgerCQRSSecretKeyForJWTAuth20261234567890",
                3600000
        );

        String token = provider.generateToken("alice", "CUSTOMER");
        assertNotNull(token);
        assertTrue(provider.validateToken(token));
        assertEquals("alice", provider.getUsernameFromToken(token));
        assertEquals("CUSTOMER", provider.getRoleFromToken(token));
    }
}
