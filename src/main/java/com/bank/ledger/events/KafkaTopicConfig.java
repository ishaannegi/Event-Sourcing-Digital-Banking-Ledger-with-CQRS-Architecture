package com.bank.ledger.events;

import org.apache.kafka.clients.admin.NewTopic;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.config.TopicBuilder;

@Configuration
public class KafkaTopicConfig {

    public static final String LEDGER_EVENTS_TOPIC = "ledger-events";

    @Bean
    public NewTopic ledgerEventsTopic() {
        return TopicBuilder.name(LEDGER_EVENTS_TOPIC)
                .partitions(3)
                .replicas(1)
                .build();
    }
}
