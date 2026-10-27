package com.bank.ledger.events;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.DefaultApplicationArguments;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestTemplate;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class PublishModeConsistencyGuardTest {

    private RestTemplate restTemplate;
    private ObjectMapper objectMapper;

    @BeforeEach
    void setUp() {
        restTemplate = mock(RestTemplate.class);
        objectMapper = new ObjectMapper();
    }

    @Test
    @DisplayName("StrictMode throws IllegalStateException when direct mode detects RUNNING Debezium connector")
    void testDirectModeWithRunningConnectorThrowsInStrictMode() {
        String json = "{\"name\":\"events-cdc-connector\",\"connector\":{\"state\":\"RUNNING\"}}";
        when(restTemplate.getForEntity(anyString(), eq(String.class)))
                .thenReturn(new ResponseEntity<>(json, HttpStatus.OK));

        PublishModeConsistencyGuard guard = new PublishModeConsistencyGuard(
                "direct",
                "http://localhost:8083",
                "events-cdc-connector",
                true, // strictMode = true
                true, // guardEnabled = true
                restTemplate,
                objectMapper
        );

        IllegalStateException ex = assertThrows(IllegalStateException.class, () ->
                guard.run(new DefaultApplicationArguments(new String[0]))
        );
        assertTrue(ex.getMessage().contains("DOUBLE PUBLISHING HAZARD"));
    }

    @Test
    @DisplayName("Non-strict mode logs error but does not throw when double publishing hazard is detected")
    void testDirectModeWithRunningConnectorLogsWarningInNonStrictMode() {
        String json = "{\"name\":\"events-cdc-connector\",\"connector\":{\"state\":\"RUNNING\"}}";
        when(restTemplate.getForEntity(anyString(), eq(String.class)))
                .thenReturn(new ResponseEntity<>(json, HttpStatus.OK));

        PublishModeConsistencyGuard guard = new PublishModeConsistencyGuard(
                "direct",
                "http://localhost:8083",
                "events-cdc-connector",
                false, // strictMode = false
                true,
                restTemplate,
                objectMapper
        );

        assertDoesNotThrow(() -> guard.run(new DefaultApplicationArguments(new String[0])));
    }

    @Test
    @DisplayName("CDC mode succeeds normally when Debezium connector is RUNNING")
    void testCdcModeWithRunningConnectorSucceeds() {
        String json = "{\"name\":\"events-cdc-connector\",\"connector\":{\"state\":\"RUNNING\"}}";
        when(restTemplate.getForEntity(anyString(), eq(String.class)))
                .thenReturn(new ResponseEntity<>(json, HttpStatus.OK));

        PublishModeConsistencyGuard guard = new PublishModeConsistencyGuard(
                "cdc",
                "http://localhost:8083",
                "events-cdc-connector",
                true,
                true,
                restTemplate,
                objectMapper
        );

        assertDoesNotThrow(() -> guard.run(new DefaultApplicationArguments(new String[0])));
    }

    @Test
    @DisplayName("Unreachable Kafka Connect REST API does not crash application")
    void testUnreachableConnectGraceful() {
        when(restTemplate.getForEntity(anyString(), eq(String.class)))
                .thenThrow(new ResourceAccessException("Connection refused"));

        PublishModeConsistencyGuard guard = new PublishModeConsistencyGuard(
                "direct",
                "http://localhost:8083",
                "events-cdc-connector",
                true,
                true,
                restTemplate,
                objectMapper
        );

        assertDoesNotThrow(() -> guard.run(new DefaultApplicationArguments(new String[0])));
    }
}
