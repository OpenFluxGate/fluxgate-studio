package org.fluxgate.studio.admin.audit;

public enum AuditAction {
  RULE_CREATE,
  RULE_UPDATE,
  RULE_TOGGLE,
  RULE_DELETE,
  RULES_DELETE_ALL,
  RULES_IMPORT,
  POLICY_PUBLISH,
  POLICY_ROLLBACK,
  KEY_LOOKUP
}
