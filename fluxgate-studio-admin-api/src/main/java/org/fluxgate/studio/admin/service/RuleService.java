package org.fluxgate.studio.admin.service;

import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
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
import org.fluxgate.studio.admin.dto.request.SimulateRequest;
import org.fluxgate.studio.admin.dto.request.UpdateRuleRequest;
import org.fluxgate.studio.admin.dto.response.BandSimulationResponse;
import org.fluxgate.studio.admin.dto.response.ImportResultResponse;
import org.fluxgate.studio.admin.dto.response.PageResponse;
import org.fluxgate.studio.admin.dto.response.RateBandResponse;
import org.fluxgate.studio.admin.dto.response.RuleResponse;
import org.fluxgate.studio.admin.dto.response.SimulationResponse;
import org.fluxgate.studio.admin.exception.InvalidRuleException;
import org.fluxgate.studio.admin.exception.RuleAlreadyExistsException;
import org.fluxgate.studio.admin.exception.RuleNotFoundException;
import org.fluxgate.studio.admin.exception.RuleVersionMismatchException;
import org.fluxgate.studio.admin.exception.StorageOperationException;
import org.fluxgate.studio.admin.repository.RuleVersions;
import org.fluxgate.studio.admin.repository.StudioRuleRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/** Service for managing rate limit rules. */
@Service
public class RuleService {

  /** Default page size applied when only one of the paging parameters is supplied. */
  public static final int DEFAULT_PAGE_SIZE = 50;

  /** Hard upper bound for the page size, protecting the storage engine from unbounded reads. */
  public static final int MAX_PAGE_SIZE = 200;

  private static final Logger log = LoggerFactory.getLogger(RuleService.class);

  private final RateLimitRuleRepository ruleRepository;
  private final StudioRuleRepository studioRuleRepository;

  public RuleService(
      RateLimitRuleRepository ruleRepository, StudioRuleRepository studioRuleRepository) {
    this.ruleRepository = ruleRepository;
    this.studioRuleRepository = studioRuleRepository;
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
   * Get a single page of rules, optionally filtered by rule set.
   *
   * @param ruleSetId optional rule set filter, {@code null} or blank for all rule sets
   * @param page zero based page index
   * @param size page size, at most {@value #MAX_PAGE_SIZE}
   * @return the requested page
   * @throws InvalidRuleException if the paging parameters are out of range
   */
  public PageResponse<RuleResponse> getRulesPage(String ruleSetId, int page, int size) {
    if (page < 0) {
      throw new InvalidRuleException("page", "must not be negative");
    }
    if (size < 1 || size > MAX_PAGE_SIZE) {
      throw new InvalidRuleException("size", "must be between 1 and " + MAX_PAGE_SIZE);
    }
    log.debug("Fetching rules page {} (size {}) for ruleSetId: {}", page, size, ruleSetId);
    try {
      List<RuleResponse> content =
          studioRuleRepository.findPage(ruleSetId, page * size, size).stream()
              .map(this::toResponse)
              .toList();
      long totalElements = studioRuleRepository.count(ruleSetId);
      return new PageResponse<>(content, page, size, totalElements);
    } catch (Exception e) {
      throw new StorageOperationException("findPage", e.getMessage(), e);
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
    return toResponse(findRuleOrThrow(id));
  }

  /**
   * Create a new rule.
   *
   * @param request the create request
   * @return the created rule
   * @throws RuleAlreadyExistsException if rule already exists
   * @throws InvalidRuleException if the rule bands are not consistent
   */
  @NotifyRuleChange(ruleSetId = "#request.ruleSetId")
  public RuleResponse createRule(CreateRuleRequest request) {
    log.debug("Creating rule: {}", request.id());
    validateBands(request.bands());
    try {
      if (ruleRepository.existsById(request.id())) {
        throw new RuleAlreadyExistsException(request.id());
      }

      RateLimitRule rule = toEntity(request, RuleVersions.INITIAL_VERSION + 1);
      if (!studioRuleRepository.insertIfAbsent(rule)) {
        throw new RuleAlreadyExistsException(request.id());
      }
      log.info("Rule created: {}", request.id());
      return toResponse(rule);
    } catch (RuleAlreadyExistsException e) {
      throw e;
    } catch (Exception e) {
      throw new StorageOperationException("create", e.getMessage(), e);
    }
  }

  /**
   * Update an existing rule using optimistic locking.
   *
   * <p>The expected version comes from the request body or, when absent, from the {@code If-Match}
   * header. The write itself is a compare-and-set against the stored version, so a concurrent
   * update is rejected instead of silently overwritten.
   *
   * @param id the rule ID
   * @param request the update request
   * @param ifMatchVersion the version taken from the {@code If-Match} header, may be {@code null}
   * @return the updated rule
   * @throws RuleNotFoundException if rule not found
   * @throws InvalidRuleException if no version was supplied or the bands are inconsistent
   * @throws RuleVersionMismatchException if the rule was modified concurrently
   */
  @NotifyRuleChange(ruleSetId = "#request.ruleSetId")
  public RuleResponse updateRule(String id, UpdateRuleRequest request, Long ifMatchVersion) {
    log.debug("Updating rule: {}", id);
    validateBands(request.bands());

    long expectedVersion = resolveExpectedVersion(request.version(), ifMatchVersion);
    RateLimitRule existing = findRuleOrThrow(id);
    long currentVersion = RuleVersions.versionOf(existing);
    if (currentVersion != expectedVersion) {
      throw new RuleVersionMismatchException(id, expectedVersion, currentVersion);
    }

    RateLimitRule rule = toEntity(id, request, currentVersion + 1);
    if (!replaceOrThrow(rule, expectedVersion)) {
      // Lost the compare-and-set race: report the version that is stored now.
      throw new RuleVersionMismatchException(
          id, expectedVersion, RuleVersions.versionOf(findRuleOrThrow(id)));
    }
    log.info("Rule updated: {} (version {} -> {})", id, currentVersion, currentVersion + 1);
    return toResponse(rule);
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
   * <p>Uses the same compare-and-set write as {@link #updateRule}: the version that was just read
   * is the expected version, so a concurrent edit is rejected with a version mismatch instead of
   * silently losing the other writer's change.
   *
   * @param id the rule ID
   * @return the updated rule
   * @throws RuleNotFoundException if rule not found
   * @throws RuleVersionMismatchException if the rule changed concurrently
   */
  @NotifyRuleChange(ruleSetId = "#result.ruleSetId")
  public RuleResponse toggleRule(String id) {
    log.debug("Toggling rule: {}", id);
    RateLimitRule rule = findRuleOrThrow(id);
    long currentVersion = RuleVersions.versionOf(rule);

    Map<String, Object> attributes = new HashMap<>(rule.getAttributes());
    attributes.put(RuleVersions.VERSION_ATTRIBUTE, currentVersion + 1);

    RateLimitRule.Builder builder =
        RateLimitRule.builder(rule.getId())
            .name(rule.getName())
            .enabled(!rule.isEnabled())
            .scope(rule.getScope())
            .keyStrategyId(rule.getKeyStrategyId())
            .onLimitExceedPolicy(rule.getOnLimitExceedPolicy())
            .ruleSetId(rule.getRuleSetIdOrNull())
            .attributes(attributes);
    rule.getBands().forEach(builder::addBand);
    RateLimitRule toggled = builder.build();

    if (!replaceOrThrow(toggled, currentVersion)) {
      // Lost the compare-and-set race: report the version that is stored now.
      throw new RuleVersionMismatchException(
          id, currentVersion, RuleVersions.versionOf(findRuleOrThrow(id)));
    }
    log.info(
        "Rule toggled: {} -> enabled={} (version {} -> {})",
        id,
        toggled.isEnabled(),
        currentVersion,
        currentVersion + 1);
    return toResponse(toggled);
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

  /**
   * Import a batch of rules, replacing rules that already exist.
   *
   * @param requests the rules to import
   * @return a summary of created and updated rules
   * @throws InvalidRuleException if any rule carries duplicate or inconsistent bands
   */
  @NotifyFullReload
  public ImportResultResponse importRules(List<CreateRuleRequest> requests) {
    log.debug("Importing {} rules", requests.size());
    validateImport(requests);

    int created = 0;
    int updated = 0;
    try {
      for (CreateRuleRequest request : requests) {
        Optional<RateLimitRule> existing = ruleRepository.findById(request.id());
        long nextVersion =
            existing
                .map(rule -> RuleVersions.versionOf(rule) + 1)
                .orElse(RuleVersions.INITIAL_VERSION + 1);
        if (existing.isPresent()) {
          long expectedVersion = RuleVersions.versionOf(existing.get());
          if (!replaceOrThrow(toEntity(request, nextVersion), expectedVersion)) {
            throw new RuleVersionMismatchException(
                request.id(),
                expectedVersion,
                RuleVersions.versionOf(findRuleOrThrow(request.id())));
          }
          updated++;
        } else {
          if (!studioRuleRepository.insertIfAbsent(toEntity(request, nextVersion))) {
            throw new RuleAlreadyExistsException(request.id());
          }
          created++;
        }
      }
    } catch (InvalidRuleException | RuleVersionMismatchException | RuleAlreadyExistsException e) {
      throw e;
    } catch (Exception e) {
      throw new StorageOperationException("import", e.getMessage(), e);
    }
    log.info("Imported rules: created={}, updated={}", created, updated);
    return new ImportResultResponse(requests.size(), created, updated);
  }

  /**
   * Run a server side dry-run of a rule against a synthetic burst.
   *
   * <p>The computation is pure arithmetic on the rule bands and never touches Redis. Each band is
   * modelled as a token bucket that starts full and refills {@code capacity} tokens per {@code
   * windowSeconds}, so the tokens available to a burst spread over {@code seconds} are {@code
   * capacity + floor(capacity / windowSeconds * seconds)}. The most restrictive band decides the
   * outcome.
   *
   * @param id the rule ID
   * @param request the burst description
   * @return the simulated outcome per band
   * @throws RuleNotFoundException if rule not found
   */
  public SimulationResponse simulate(String id, SimulateRequest request) {
    log.debug(
        "Simulating rule {} with {} requests over {}s", id, request.requests(), request.seconds());
    RateLimitRule rule = findRuleOrThrow(id);

    long requests = request.requests();
    long seconds = request.seconds();
    List<BandSimulationResponse> bands = new ArrayList<>();
    long mostRestrictiveAvailable = Long.MAX_VALUE;
    boolean allowed = true;

    for (RateLimitBand band : rule.getBands()) {
      long available = availableTokens(band, seconds);
      boolean exceeded = requests > available;
      bands.add(
          new BandSimulationResponse(
              band.getLabel(),
              band.getWindow().toSeconds(),
              band.getCapacity(),
              available,
              Math.min(requests, available),
              Math.max(0, available - requests),
              exceeded));
      allowed = allowed && !exceeded;
      mostRestrictiveAvailable = Math.min(mostRestrictiveAvailable, available);
    }

    // RateLimitRule guarantees at least one band, so mostRestrictiveAvailable is always assigned.
    return new SimulationResponse(
        id,
        requests,
        seconds,
        allowed,
        Math.min(requests, mostRestrictiveAvailable),
        Math.max(0, mostRestrictiveAvailable - requests),
        bands);
  }

  /**
   * Tokens a band offers to a burst spread over {@code seconds}, starting from a full bucket.
   *
   * <p>Computed with exact integer arithmetic ({@code capacity + floor(capacity * seconds /
   * windowSeconds)}) and saturated at {@link Long#MAX_VALUE} instead of overflowing.
   */
  private long availableTokens(RateLimitBand band, long seconds) {
    long capacity = band.getCapacity();
    long windowSeconds = band.getWindow().toSeconds();
    if (windowSeconds <= 0) {
      return capacity;
    }
    try {
      long whole = Math.multiplyExact(capacity / windowSeconds, seconds);
      long fraction = Math.multiplyExact(capacity % windowSeconds, seconds) / windowSeconds;
      return Math.addExact(capacity, Math.addExact(whole, fraction));
    } catch (ArithmeticException overflow) {
      return Long.MAX_VALUE;
    }
  }

  private RateLimitRule findRuleOrThrow(String id) {
    try {
      return ruleRepository.findById(id).orElseThrow(() -> new RuleNotFoundException(id));
    } catch (RuleNotFoundException e) {
      throw e;
    } catch (Exception e) {
      throw new StorageOperationException("findById", e.getMessage(), e);
    }
  }

  private boolean replaceOrThrow(RateLimitRule rule, long expectedVersion) {
    try {
      return studioRuleRepository.replaceIfVersionMatches(rule, expectedVersion);
    } catch (InvalidRuleException e) {
      throw e;
    } catch (Exception e) {
      throw new StorageOperationException("update", e.getMessage(), e);
    }
  }

  private long resolveExpectedVersion(Long bodyVersion, Long ifMatchVersion) {
    if (bodyVersion != null) {
      return bodyVersion;
    }
    if (ifMatchVersion != null) {
      return ifMatchVersion;
    }
    throw new InvalidRuleException(
        "version", "is required for updates; send it in the body or as an If-Match header");
  }

  private void validateImport(List<CreateRuleRequest> requests) {
    Set<String> ids = new HashSet<>();
    for (CreateRuleRequest request : requests) {
      if (!ids.add(request.id())) {
        throw new InvalidRuleException("rules", "duplicate rule id in import: " + request.id());
      }
      validateBands(request.bands());
    }
  }

  private void validateBands(List<RateBandRequest> bands) {
    Set<Long> windows = new HashSet<>();
    for (RateBandRequest band : bands) {
      if (!windows.add(band.windowSeconds())) {
        throw new InvalidRuleException(
            "bands", "duplicate band window: " + band.windowSeconds() + " seconds");
      }
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

    // The optimistic locking token is surfaced as a dedicated field, not as a free-form attribute.
    Map<String, Object> attributes = new HashMap<>(rule.getAttributes());
    attributes.remove(RuleVersions.VERSION_ATTRIBUTE);

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
        attributes,
        RuleVersions.versionOf(rule));
  }

  private RateLimitRule toEntity(CreateRuleRequest request, long version) {
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
        request.attributes(),
        version);
  }

  private RateLimitRule toEntity(String id, UpdateRuleRequest request, long version) {
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
        request.attributes(),
        version);
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
      Map<String, Object> attributes,
      long version) {

    Map<String, Object> attrs = attributes != null ? new HashMap<>(attributes) : new HashMap<>();
    if (tags != null && !tags.isEmpty()) {
      attrs.put("tags", tags);
    }
    attrs.put(RuleVersions.VERSION_ATTRIBUTE, version);

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
