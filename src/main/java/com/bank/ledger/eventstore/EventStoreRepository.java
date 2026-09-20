package com.bank.ledger.eventstore;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface EventStoreRepository extends JpaRepository<EventEntity, UUID> {
    List<EventEntity> findByAggregateIdOrderByVersionAsc(String aggregateId);
    List<EventEntity> findByAggregateIdAndVersionGreaterThanOrderByVersionAsc(String aggregateId, Long version);
    Optional<EventEntity> findTopByAggregateIdOrderByVersionDesc(String aggregateId);
}

