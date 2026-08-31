package com.bank.ledger.events;

import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;
import java.time.Instant;

@JsonTypeInfo(
    use = JsonTypeInfo.Id.NAME,
    include = JsonTypeInfo.As.PROPERTY,
    property = "@type"
)
@JsonSubTypes({
    @JsonSubTypes.Type(value = AccountOpenedEvent.class, name = "AccountOpenedEvent"),
    @JsonSubTypes.Type(value = FundsDepositedEvent.class, name = "FundsDepositedEvent"),
    @JsonSubTypes.Type(value = FundsWithdrawnEvent.class, name = "FundsWithdrawnEvent"),
    @JsonSubTypes.Type(value = TransferInitiatedEvent.class, name = "TransferInitiatedEvent")
})
public interface DomainEvent {
    String getAggregateId();
    String getEventType();
    Instant getTimestamp();
}
