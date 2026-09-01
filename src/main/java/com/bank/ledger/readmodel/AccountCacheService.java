package com.bank.ledger.readmodel;

import com.bank.ledger.api.DTOs;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.Optional;

@Service
public class AccountCacheService {

    private static final Logger log = LoggerFactory.getLogger(AccountCacheService.class);
    public static final String CACHE_KEY_PREFIX = "account:balance:";
    public static final long DEFAULT_TTL_SECONDS = 600; // 10 minutes TTL safety net

    private final RedisTemplate<String, Object> redisTemplate;
    private final ObjectMapper objectMapper;

    public AccountCacheService(RedisTemplate<String, Object> redisTemplate, ObjectMapper objectMapper) {
        this.redisTemplate = redisTemplate;
        this.objectMapper = objectMapper;
    }

    public Optional<DTOs.AccountResponse> get(String accountId) {
        String key = CACHE_KEY_PREFIX + accountId;
        try {
            Object cachedVal = redisTemplate.opsForValue().get(key);
            if (cachedVal != null) {
                DTOs.AccountResponse response = objectMapper.convertValue(cachedVal, DTOs.AccountResponse.class);
                log.info("[CACHE HIT] Fetched account balance from Redis for account [{}] (Balance: {}, Version: {})",
                        accountId, response.balance(), response.version());
                return Optional.of(response);
            }
        } catch (Exception e) {
            log.error("[CACHE ERROR] Exception reading from Redis for account [{}]: {}", accountId, e.getMessage());
        }
        return Optional.empty();
    }

    public void put(String accountId, DTOs.AccountResponse response) {
        put(accountId, response, DEFAULT_TTL_SECONDS);
    }

    public void put(String accountId, DTOs.AccountResponse response, long ttlSeconds) {
        String key = CACHE_KEY_PREFIX + accountId;
        try {
            redisTemplate.opsForValue().set(key, response, Duration.ofSeconds(ttlSeconds));
            log.info("[WRITE-THROUGH CACHE] Updated Redis key [{}] for account [{}] (Balance: {}, Version: {}, TTL: {}s)",
                    key, accountId, response.balance(), response.version(), ttlSeconds);
        } catch (Exception e) {
            log.error("[CACHE ERROR] Exception writing to Redis for account [{}]: {}", accountId, e.getMessage());
        }
    }

    public void evict(String accountId) {
        String key = CACHE_KEY_PREFIX + accountId;
        try {
            redisTemplate.delete(key);
            log.info("[CACHE EVICT] Evicted Redis key [{}] for account [{}]", key, accountId);
        } catch (Exception e) {
            log.error("[CACHE ERROR] Exception evicting Redis key for account [{}]: {}", accountId, e.getMessage());
        }
    }
}
