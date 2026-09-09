package com.bank.ledger.readmodel;

import com.bank.ledger.api.DTOs;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.data.redis.connection.RedisConnection;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Optional;

@Service
public class AccountCacheService {

    private static final Logger log = LoggerFactory.getLogger(AccountCacheService.class);
    public static final String CACHE_KEY_PREFIX = "account:balance:";
    public static final long DEFAULT_TTL_SECONDS = 600; // 10 minutes TTL safety net

    private final RedisTemplate<String, DTOs.AccountResponse> accountResponseRedisTemplate;
    private final RedisConnectionFactory connectionFactory;
    private final ObjectMapper objectMapper;

    public AccountCacheService(@Qualifier("accountResponseRedisTemplate") RedisTemplate<String, DTOs.AccountResponse> accountResponseRedisTemplate,
                               RedisConnectionFactory connectionFactory,
                               ObjectMapper objectMapper) {
        this.accountResponseRedisTemplate = accountResponseRedisTemplate;
        this.connectionFactory = connectionFactory;
        this.objectMapper = objectMapper;
    }

    public Optional<DTOs.AccountResponse> get(String accountId) {
        String key = CACHE_KEY_PREFIX + accountId;
        try {
            // (a) Measure time to acquire connection from connection pool
            long t0 = System.nanoTime();
            RedisConnection conn = connectionFactory.getConnection();
            long connTimeUs = (System.nanoTime() - t0) / 1000;

            // (b) Measure raw Redis GET execution time (byte level)
            long t1 = System.nanoTime();
            byte[] rawBytes = conn.stringCommands().get(key.getBytes(StandardCharsets.UTF_8));
            long rawGetTimeUs = (System.nanoTime() - t1) / 1000;
            conn.close();

            // (c1) Single-step direct Jackson deserialization
            long jsonDeUs = 0;
            DTOs.AccountResponse directResponse = null;
            if (rawBytes != null && rawBytes.length > 0) {
                long t2 = System.nanoTime();
                directResponse = objectMapper.readValue(rawBytes, DTOs.AccountResponse.class);
                jsonDeUs = (System.nanoTime() - t2) / 1000;
            }

            // (c2) Typed RedisTemplate single-step GET (no convertValue needed!)
            long t3 = System.nanoTime();
            DTOs.AccountResponse templateResponse = accountResponseRedisTemplate.opsForValue().get(key);
            long templateGetTimeUs = (System.nanoTime() - t3) / 1000;

            log.info("[REDIS READ TIMING BREAKDOWN] Key: [{}] | (a) Conn Pool Acquire: {} ms ({} us) | (b) Raw Redis GET: {} ms ({} us) | (c1) Direct Jackson readValue: {} ms ({} us) | (c2) Typed RedisTemplate GET: {} ms ({} us)",
                    key,
                    String.format("%.3f", connTimeUs / 1000.0), connTimeUs,
                    String.format("%.3f", rawGetTimeUs / 1000.0), rawGetTimeUs,
                    String.format("%.3f", jsonDeUs / 1000.0), jsonDeUs,
                    String.format("%.3f", templateGetTimeUs / 1000.0), templateGetTimeUs);

            DTOs.AccountResponse result = (templateResponse != null) ? templateResponse : directResponse;
            if (result != null) {
                log.info("[CACHE HIT] Fetched account balance from Redis for account [{}] (Balance: {}, Version: {})",
                        accountId, result.balance(), result.version());
                return Optional.of(result);
            }
        } catch (Exception e) {
            log.error("[CACHE ERROR] Exception reading from Redis for account [{}]: {}", accountId, e.getMessage(), e);
        }
        return Optional.empty();
    }

    public void put(String accountId, DTOs.AccountResponse response) {
        put(accountId, response, DEFAULT_TTL_SECONDS);
    }

    public void put(String accountId, DTOs.AccountResponse response, long ttlSeconds) {
        String key = CACHE_KEY_PREFIX + accountId;
        try {
            accountResponseRedisTemplate.opsForValue().set(key, response, Duration.ofSeconds(ttlSeconds));
            log.info("[WRITE-THROUGH CACHE] Updated Redis key [{}] for account [{}] (Balance: {}, Version: {}, TTL: {}s)",
                    key, accountId, response.balance(), response.version(), ttlSeconds);
        } catch (Exception e) {
            log.error("[CACHE ERROR] Exception writing to Redis for account [{}]: {}", accountId, e.getMessage());
        }
    }

    public void evict(String accountId) {
        String key = CACHE_KEY_PREFIX + accountId;
        try {
            accountResponseRedisTemplate.delete(key);
            log.info("[CACHE EVICT] Evicted Redis key [{}] for account [{}]", key, accountId);
        } catch (Exception e) {
            log.error("[CACHE ERROR] Exception evicting Redis key for account [{}]: {}", accountId, e.getMessage());
        }
    }
}
