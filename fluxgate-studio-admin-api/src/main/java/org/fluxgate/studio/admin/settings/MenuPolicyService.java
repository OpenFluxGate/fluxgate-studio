package org.fluxgate.studio.admin.settings;

import java.time.Clock;
import java.util.List;
import java.util.Map;
import org.bson.Document;
import org.bson.types.ObjectId;
import org.fluxgate.studio.admin.audit.AuditAction;
import org.fluxgate.studio.admin.audit.AuditActor;
import org.fluxgate.studio.admin.audit.AuditEntry;
import org.fluxgate.studio.admin.audit.MongoAuditStore;
import org.fluxgate.studio.admin.exception.MenuPolicyException;
import org.fluxgate.studio.admin.exception.StorageConnectionException;
import org.fluxgate.studio.admin.settings.MongoSettingsStore.StoredMenuPolicy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;

@Service
public class MenuPolicyService {

  private static final Logger log = LoggerFactory.getLogger(MenuPolicyService.class);

  private final MongoSettingsStore store;
  private final MongoAuditStore auditStore;
  private final Clock clock;

  public MenuPolicyService(MongoSettingsStore store, MongoAuditStore auditStore, Clock clock) {
    this.store = store;
    this.auditStore = auditStore;
    this.clock = clock;
  }

  public List<String> menus(boolean admin) {
    MenuPolicy policy = store.menuPolicy().policy();
    return admin ? policy.admin() : policy.user();
  }

  public MenuPolicy current() {
    StoredMenuPolicy stored = store.menuPolicy();
    tryPublish(stored);
    return stored.policy();
  }

  public Saved update(Authentication authentication, MenuPolicy requested) {
    StoredMenuPolicy stored = store.menuPolicy();
    MenuPolicy previous = stored.policy();
    if (requested.version() != previous.version()) {
      throw conflict();
    }
    if (requested.equals(previous)) {
      return new Saved(previous, tryPublish(stored));
    }
    if (previous.version() == MenuPolicy.MAX_VERSION) {
      throw new MenuPolicyException(HttpStatus.CONFLICT, "Menu policy version limit reached");
    }
    MenuPolicy next = new MenuPolicy(previous.version() + 1, requested.admin(), requested.user());
    // Drain the last event before another write can replace its pending slot.
    publish(stored);
    AuditEntry entry =
        new AuditEntry(
            new ObjectId().toHexString(),
            clock.instant(),
            AuditActor.from(authentication),
            AuditAction.MENU_POLICY_UPDATE,
            Map.of("setting", "menus"),
            describe(previous),
            describe(next),
            null);
    Document pending = MongoAuditStore.toDocument(entry);
    if (!store.saveMenuPolicy(next, pending)) {
      throw conflict();
    }
    return new Saved(next, tryPublish(new StoredMenuPolicy(next, pending)));
  }

  public void publishPending() {
    publish(store.menuPolicy());
  }

  private boolean tryPublish(StoredMenuPolicy stored) {
    try {
      publish(stored);
      return true;
    } catch (StorageConnectionException ex) {
      log.warn("Menu policy audit for version {} is pending", stored.policy().version(), ex);
      return false;
    }
  }

  private void publish(StoredMenuPolicy stored) {
    if (stored.pendingAudit() != null) {
      auditStore.insertPendingMenuAudit(stored.pendingAudit());
      store.clearPendingMenuAudit(stored.policy().version());
    }
  }

  private static Map<String, Object> describe(MenuPolicy policy) {
    return Map.of("version", policy.version(), "admin", policy.admin(), "user", policy.user());
  }

  private static MenuPolicyException conflict() {
    return new MenuPolicyException(
        HttpStatus.CONFLICT, "Menu policy changed. Reload and try again.");
  }

  public record Saved(MenuPolicy policy, boolean auditPublished) {}
}
