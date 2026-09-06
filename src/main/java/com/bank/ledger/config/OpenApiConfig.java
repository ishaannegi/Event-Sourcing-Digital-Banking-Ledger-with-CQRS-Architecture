package com.bank.ledger.config;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Contact;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.info.License;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class OpenApiConfig {

    private static final String SECURITY_SCHEME_NAME = "bearerAuth";

    @Bean
    public OpenAPI customOpenAPI() {
        return new OpenAPI()
                .info(new Info()
                        .title("Digital Banking Ledger API")
                        .version("1.0.0")
                        .description("""
                                Event-Sourced Digital Banking Ledger with CQRS Architecture & JWT Security.
                                
                                Features:
                                - **Authentication**: JWT Bearer token authentication with Role-Based Access Control (CUSTOMER vs ADMIN).
                                - **Command Side**: Immutable domain events, optimistic locking, and atomic double-entry transaction checks (SUM(Debits) == SUM(Credits)).
                                - **Event Store**: PostgreSQL append-only event store.
                                - **Read Side (CQRS)**: Async projections over Kafka, PostgreSQL Read Model, and Redis Cache-Aside layer.
                                - **Observability**: MDC Correlation ID tracking across HTTP and Kafka event streaming.
                                """)
                        .contact(new Contact()
                                .name("Engineering Team")
                                .email("engineering@bank.com"))
                        .license(new License().name("Apache 2.0")))
                .addSecurityItem(new SecurityRequirement().addList(SECURITY_SCHEME_NAME))
                .components(new Components()
                        .addSecuritySchemes(SECURITY_SCHEME_NAME, new SecurityScheme()
                                .name(SECURITY_SCHEME_NAME)
                                .type(SecurityScheme.Type.HTTP)
                                .scheme("bearer")
                                .bearerFormat("JWT")));
    }
}
