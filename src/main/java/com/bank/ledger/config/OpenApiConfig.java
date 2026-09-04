package com.bank.ledger.config;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Contact;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.info.License;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class OpenApiConfig {

    @Bean
    public OpenAPI customOpenAPI() {
        return new OpenAPI()
                .info(new Info()
                        .title("Digital Banking Ledger API")
                        .version("1.0.0")
                        .description("""
                                Event-Sourced Digital Banking Ledger with CQRS Architecture.
                                
                                Features:
                                - **Command Side**: Immutable domain events, optimistic locking, and atomic double-entry transaction checks (SUM(Debits) == SUM(Credits)).
                                - **Event Store**: PostgreSQL append-only event store.
                                - **Read Side (CQRS)**: Async projections over Kafka, PostgreSQL Read Model, and Redis Cache-Aside layer.
                                - **Observability**: MDC Correlation ID tracking across HTTP and Kafka event streaming.
                                """)
                        .contact(new Contact()
                                .name("Engineering Team")
                                .email("engineering@bank.com"))
                        .license(new License().name("Apache 2.0")));
    }
}
