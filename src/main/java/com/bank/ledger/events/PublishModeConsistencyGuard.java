package com.bank.ledger.events;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestTemplate;

/**
 * Startup sanity guard to detect double-publishing hazards or stale configurations.
 * Prevents catastrophic scenarios where both direct KafkaEventProducer and Debezium CDC
 * simultaneously stream events to ledger-events.
 */
@Component
public class PublishModeConsistencyGuard implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(PublishModeConsistencyGuard.class);

    private final String publishMode;
    private final String connectUrl;
    private final String connectorName;
    private final boolean strictMode;
    private final boolean guardEnabled;
    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper;

    @org.springframework.beans.factory.annotation.Autowired
    public PublishModeConsistencyGuard(
            @Value("${ledger.publish.mode:direct}") String publishMode,
            @Value("${ledger.publish.guard.connect-url:http://localhost:8083}") String connectUrl,
            @Value("${ledger.publish.guard.connector-name:events-cdc-connector}") String connectorName,
            @Value("${ledger.publish.guard.strict:false}") boolean strictMode,
            @Value("${ledger.publish.guard.enabled:true}") boolean guardEnabled,
            ObjectMapper objectMapper) {
        this.publishMode = publishMode;
        this.connectUrl = connectUrl;
        this.connectorName = connectorName;
        this.strictMode = strictMode;
        this.guardEnabled = guardEnabled;
        this.objectMapper = objectMapper;

        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(2000);
        factory.setReadTimeout(2000);
        this.restTemplate = new RestTemplate(factory);
    }

    // Constructor for testing with mock RestTemplate
    PublishModeConsistencyGuard(
            String publishMode,
            String connectUrl,
            String connectorName,
            boolean strictMode,
            boolean guardEnabled,
            RestTemplate restTemplate,
            ObjectMapper objectMapper) {
        this.publishMode = publishMode;
        this.connectUrl = connectUrl;
        this.connectorName = connectorName;
        this.strictMode = strictMode;
        this.guardEnabled = guardEnabled;
        this.restTemplate = restTemplate;
        this.objectMapper = objectMapper;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (!guardEnabled) {
            log.info("[PUBLISH GUARD] Consistency guard is disabled via ledger.publish.guard.enabled=false.");
            return;
        }

        String connectorState = checkConnectorState();

        if ("RUNNING".equalsIgnoreCase(connectorState) && "direct".equalsIgnoreCase(publishMode)) {
            String errorMsg = String.format(
                    "[PUBLISH GUARD CRITICAL] DOUBLE PUBLISHING HAZARD! Application is in 'direct' mode (ledger.publish.mode=direct), " +
                    "but Debezium connector '%s' is RUNNING at %s! Both direct producer and CDC will publish duplicate events to 'ledger-events'.",
                    connectorName, connectUrl);
            log.error(errorMsg);
            if (strictMode) {
                throw new IllegalStateException(errorMsg);
            }
        } else if (!"RUNNING".equalsIgnoreCase(connectorState) && "cdc".equalsIgnoreCase(publishMode)) {
            log.warn("[PUBLISH GUARD WARNING] Application is in 'cdc' mode (ledger.publish.mode=cdc), " +
                     "but Debezium connector '{}' is NOT RUNNING (state: {}). Domain events will not reach Kafka until connector starts!",
                    connectorName, connectorState);
        } else {
            log.info("[PUBLISH GUARD] Verified publish mode [{}] is consistent with Debezium connector [{}] state [{}].",
                    publishMode, connectorName, connectorState);
        }
    }

    public String checkConnectorState() {
        String statusUrl = String.format("%s/connectors/%s/status", connectUrl, connectorName);
        try {
            ResponseEntity<String> response = restTemplate.getForEntity(statusUrl, String.class);
            if (response.getStatusCode() == HttpStatus.OK && response.getBody() != null) {
                JsonNode root = objectMapper.readTree(response.getBody());
                JsonNode connectorNode = root.path("connector");
                return connectorNode.path("state").asText("UNKNOWN");
            }
            return "UNAVAILABLE";
        } catch (HttpClientErrorException.NotFound e) {
            return "NOT_FOUND";
        } catch (ResourceAccessException e) {
            log.debug("[PUBLISH GUARD] Kafka Connect REST API at {} is unreachable: {}. Assuming standalone/offline environment.",
                    connectUrl, e.getMessage());
            return "UNREACHABLE";
        } catch (Exception e) {
            log.warn("[PUBLISH GUARD] Failed to query Kafka Connect connector status: {}", e.getMessage());
            return "ERROR";
        }
    }
}
