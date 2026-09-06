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

        String hash = encoder.encode("admin123");
        assertTrue(encoder.matches("admin123", hash));
        assertFalse(encoder.matches("wrongpassword", hash));
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
