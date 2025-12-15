package org.fluxgate.studio.admin.service;

import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;
import org.fluxgate.control.aop.NotifyFullReload;
import org.fluxgate.control.aop.NotifyRuleChange;
import org.fluxgate.core.config.LimitScope;
import org.fluxgate.core.config.OnLimitExceedPolicy;
import org.fluxgate.core.config.RateLimitBand;
import org.fluxgate.core.config.RateLimitRule;
import org.fluxgate.core.spi.RateLimitRuleRepository;
import org.fluxgate.studio.admin.dto.request.CreateRuleRequest;
import org.fluxgate.studio.admin.dto.request.RateBandRequest;
import org.fluxgate.studio.admin.dto.request.UpdateRuleRequest;
import org.fluxgate.studio.admin.dto.response.RateBandResponse;
import org.fluxgate.studio.admin.dto.response.RuleResponse;
import org.fluxgate.studio.admin.exception.RuleAlreadyExistsException;
import org.fluxgate.studio.admin.exception.RuleNotFoundException;
import org.fluxgate.studio.admin.exception.StorageOperationException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/** Service for managing rate limit rules. */
@Service
public class RuleService {

  private static final Logger log = LoggerFactory.getLogger(RuleService.class);

  private final RateLimitRuleRepository ruleRepository;

  public RuleService(RateLimitRuleRepository ruleRepository) {
    this.ruleRepository = ruleRepository;
  }

  /**
   * Get all rules.
   *
   * @return list of all rules
   */
  public List<RuleResponse> getAllRules() {
    log.debug("Fetching all rules");
    try {
      return ruleRepository.findAll().stream().map(this::toResponse).toList();
    } catch (Exception e) {
      throw new StorageOperationException("findAll", e.getMessage(), e);
    }
  }

  /**
   * Get rules by rule set ID.
   *
   * @param ruleSetId the rule set ID
   * @return list of rules in the rule set
   */
  public List<RuleResponse> getRulesByRuleSetId(String ruleSetId) {
    log.debug("Fetching rules for ruleSetId: {}", ruleSetId);
    try {
      return ruleRepository.findByRuleSetId(ruleSetId).stream().map(this::toResponse).toList();
    } catch (Exception e) {
      throw new StorageOperationException("findByRuleSetId", e.getMessage(), e);
    }
  }

  /**
   * Get a rule by ID.
   *
   * @param id the rule ID
   * @return the rule
   * @throws RuleNotFoundException if rule not found
   */
  public RuleResponse getRuleById(String id) {
    log.debug("Fetching rule: {}", id);
    try {
      return ruleRepository
          .findById(id)
          .map(this::toResponse)
          .orElseThrow(() -> new RuleNotFoundException(id));
    } catch (RuleNotFoundException e) {
      throw e;
    } catch (Exception e) {
      throw new StorageOperationException("findById", e.getMessage(), e);
    }
  }

  /**
   * Create a new rule.
   *
   * @param request the create request
   * @return the created rule
   * @throws RuleAlreadyExistsException if rule already exists
   */
  @NotifyRuleChange(ruleSetId = "#request.ruleSetId")
  public RuleResponse createRule(CreateRuleRequest request) {
    log.debug("Creating rule: {}", request.id());
    try {
      if (ruleRepository.existsById(request.id())) {
        throw new RuleAlreadyExistsException(request.id());
      }

      RateLimitRule rule = toEntity(request);
      ruleRepository.save(rule);
      log.info("Rule created: {}", request.id());
      return toResponse(rule);
    } catch (RuleAlreadyExistsException e) {
      throw e;
    } catch (Exception e) {
      throw new StorageOperationException("create", e.getMessage(), e);
    }
  }

  /**
   * Update an existing rule.
   *
   * @param id the rule ID
   * @param request the update request
   * @return the updated rule
   * @throws RuleNotFoundException if rule not found
   */
  @NotifyRuleChange(ruleSetId = "#request.ruleSetId")
  public RuleResponse updateRule(String id, UpdateRuleRequest request) {
    log.debug("Updating rule: {}", id);
    try {
      if (!ruleRepository.existsById(id)) {
        throw new RuleNotFoundException(id);
      }

      RateLimitRule rule = toEntity(id, request);
      ruleRepository.save(rule);
      log.info("Rule updated: {}", id);
      return toResponse(rule);
    } catch (RuleNotFoundException e) {
      throw e;
    } catch (Exception e) {
      throw new StorageOperationException("update", e.getMessage(), e);
    }
  }

  /**
   * Delete a rule by ID.
   *
   * @param id the rule ID
   * @throws RuleNotFoundException if rule not found
   */
  @NotifyFullReload
  public void deleteRule(String id) {
    log.debug("Deleting rule: {}", id);
    try {
      if (!ruleRepository.deleteById(id)) {
        throw new RuleNotFoundException(id);
      }
      log.info("Rule deleted: {}", id);
    } catch (RuleNotFoundException e) {
      throw e;
    } catch (Exception e) {
      throw new StorageOperationException("delete", e.getMessage(), e);
    }
  }

  /**
   * Toggle rule enabled status.
   *
   * @param id the rule ID
   * @return the updated rule
   * @throws RuleNotFoundException if rule not found
   */
  @NotifyRuleChange(ruleSetId = "#result.ruleSetId")
  public RuleResponse toggleRule(String id) {
    log.debug("Toggling rule: {}", id);
    try {
      Optional<RateLimitRule> existing = ruleRepository.findById(id);
      if (existing.isEmpty()) {
        throw new RuleNotFoundException(id);
      }

      RateLimitRule rule = existing.get();
      RateLimitRule.Builder builder =
          RateLimitRule.builder(rule.getId())
              .name(rule.getName())
              .enabled(!rule.isEnabled())
              .scope(rule.getScope())
              .keyStrategyId(rule.getKeyStrategyId())
              .onLimitExceedPolicy(rule.getOnLimitExceedPolicy())
              .ruleSetId(rule.getRuleSetIdOrNull())
              .attributes(rule.getAttributes());
      rule.getBands().forEach(builder::addBand);
      RateLimitRule toggled = builder.build();

      ruleRepository.save(toggled);
      log.info("Rule toggled: {} -> enabled={}", id, toggled.isEnabled());
      return toResponse(toggled);
    } catch (RuleNotFoundException e) {
      throw e;
    } catch (Exception e) {
      throw new StorageOperationException("toggle", e.getMessage(), e);
    }
  }

  /**
   * Delete all rules in a rule set.
   *
   * @param ruleSetId the rule set ID
   * @return number of deleted rules
   */
  @NotifyRuleChange(ruleSetId = "#ruleSetId")
  public int deleteByRuleSetId(String ruleSetId) {
    log.debug("Deleting rules for ruleSetId: {}", ruleSetId);
    try {
      int count = ruleRepository.deleteByRuleSetId(ruleSetId);
      log.info("Deleted {} rules for ruleSetId: {}", count, ruleSetId);
      return count;
    } catch (Exception e) {
      throw new StorageOperationException("deleteByRuleSetId", e.getMessage(), e);
    }
  }

  private RuleResponse toResponse(RateLimitRule rule) {
    List<RateBandResponse> bands =
        rule.getBands().stream()
            .map(
                band ->
                    new RateBandResponse(
                        band.getWindow().toSeconds(), band.getCapacity(), band.getLabel()))
            .toList();

    List<String> tags = extractTags(rule.getAttributes());

    return new RuleResponse(
        rule.getId(),
        rule.getName(),
        rule.isEnabled(),
        rule.getScope().name(),
        rule.getKeyStrategyId(),
        rule.getOnLimitExceedPolicy().name(),
        bands,
        rule.getRuleSetIdOrNull(),
        tags,
        rule.getAttributes());
  }

  private RateLimitRule toEntity(CreateRuleRequest request) {
    return toEntity(
        request.id(),
        request.name(),
        request.enabled(),
        request.scope(),
        request.keyStrategyId(),
        request.onLimitExceedPolicy(),
        request.bands(),
        request.ruleSetId(),
        request.tags(),
        request.attributes());
  }

  private RateLimitRule toEntity(String id, UpdateRuleRequest request) {
    return toEntity(
        id,
        request.name(),
        request.enabled(),
        request.scope(),
        request.keyStrategyId(),
        request.onLimitExceedPolicy(),
        request.bands(),
        request.ruleSetId(),
        request.tags(),
        request.attributes());
  }

  private RateLimitRule toEntity(
      String id,
      String name,
      boolean enabled,
      String scope,
      String keyStrategyId,
      String onLimitExceedPolicy,
      List<RateBandRequest> bandRequests,
      String ruleSetId,
      List<String> tags,
      Map<String, Object> attributes) {

    Map<String, Object> attrs =
        attributes != null ? new java.util.HashMap<>(attributes) : new java.util.HashMap<>();
    if (tags != null && !tags.isEmpty()) {
      attrs.put("tags", tags);
    }

    RateLimitRule.Builder builder =
        RateLimitRule.builder(id)
            .name(name)
            .enabled(enabled)
            .scope(LimitScope.valueOf(scope))
            .keyStrategyId(keyStrategyId)
            .onLimitExceedPolicy(OnLimitExceedPolicy.valueOf(onLimitExceedPolicy))
            .ruleSetId(ruleSetId)
            .attributes(attrs);

    bandRequests.forEach(
        b ->
            builder.addBand(
                RateLimitBand.builder(Duration.ofSeconds(b.windowSeconds()), b.capacity())
                    .label(b.label())
                    .build()));

    return builder.build();
  }

  @SuppressWarnings("unchecked")
  private List<String> extractTags(Map<String, Object> attributes) {
    if (attributes == null || !attributes.containsKey("tags")) {
      return List.of();
    }
    Object tags = attributes.get("tags");
    if (tags instanceof List) {
      return ((List<?>) tags)
          .stream()
              .filter(t -> t instanceof String)
              .map(t -> (String) t)
              .collect(Collectors.toList());
    }
    return List.of();
  }
}
