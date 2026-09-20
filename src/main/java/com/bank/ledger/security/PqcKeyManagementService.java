package com.bank.ledger.security;

import org.bouncycastle.pqc.jcajce.provider.BouncyCastlePQCProvider;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.Security;
import java.security.Signature;
import java.security.spec.PKCS8EncodedKeySpec;
import java.security.spec.X509EncodedKeySpec;
import java.util.Base64;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class PqcKeyManagementService {

    private static final Logger log = LoggerFactory.getLogger(PqcKeyManagementService.class);
    public static final String ALGORITHM = "DILITHIUM3";
    public static final String PROVIDER = "BCPQC";

    static {
        if (Security.getProvider(PROVIDER) == null) {
            Security.addProvider(new BouncyCastlePQCProvider());
            log.info("Registered Bouncy Castle Post-Quantum Cryptography Provider ({})", PROVIDER);
        }
    }

    private final Map<String, KeyPair> systemKeyStore = new ConcurrentHashMap<>();
    private final KeyPair masterKeyPair;

    public PqcKeyManagementService() {
        this.masterKeyPair = generateKeyPair();
        log.info("Generated Master Post-Quantum Keypair ({})", ALGORITHM);
    }

    public KeyPair generateKeyPair() {
        try {
            KeyPairGenerator kpg = KeyPairGenerator.getInstance(ALGORITHM, PROVIDER);
            return kpg.generateKeyPair();
        } catch (Exception e) {
            log.error("Failed to generate PQC keypair for algorithm [{}]: {}", ALGORITHM, e.getMessage());
            throw new RuntimeException("Post-Quantum KeyPair generation failed", e);
        }
    }

    public KeyPair getOrCreateAccountKeyPair(String accountId) {
        return systemKeyStore.computeIfAbsent(accountId, k -> generateKeyPair());
    }

    public KeyPair getMasterKeyPair() {
        return masterKeyPair;
    }

    public String sign(PrivateKey privateKey, String dataToSign) {
        try {
            Signature signature = Signature.getInstance(ALGORITHM, PROVIDER);
            signature.initSign(privateKey);
            signature.update(dataToSign.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            byte[] sigBytes = signature.sign();
            return Base64.getEncoder().encodeToString(sigBytes);
        } catch (Exception e) {
            log.error("Failed to generate PQC signature: {}", e.getMessage());
            throw new RuntimeException("Post-Quantum Signature generation failed", e);
        }
    }

    public boolean verify(PublicKey publicKey, String dataToVerify, String signatureBase64) {
        if (publicKey == null || signatureBase64 == null || signatureBase64.isBlank()) {
            return false;
        }
        try {
            Signature signature = Signature.getInstance(ALGORITHM, PROVIDER);
            signature.initVerify(publicKey);
            signature.update(dataToVerify.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            byte[] sigBytes = Base64.getDecoder().decode(signatureBase64);
            return signature.verify(sigBytes);
        } catch (Exception e) {
            log.error("PQC signature verification failed: {}", e.getMessage());
            return false;
        }
    }

    public String encodePublicKey(PublicKey publicKey) {
        return Base64.getEncoder().encodeToString(publicKey.getEncoded());
    }

    public PublicKey decodePublicKey(String base64PublicKey) {
        try {
            byte[] keyBytes = Base64.getDecoder().decode(base64PublicKey);
            X509EncodedKeySpec keySpec = new X509EncodedKeySpec(keyBytes);
            KeyFactory keyFactory = KeyFactory.getInstance(ALGORITHM, PROVIDER);
            return keyFactory.generatePublic(keySpec);
        } catch (Exception e) {
            log.error("Failed to decode PQC public key: {}", e.getMessage());
            throw new RuntimeException("Failed to decode PQC public key", e);
        }
    }
}
