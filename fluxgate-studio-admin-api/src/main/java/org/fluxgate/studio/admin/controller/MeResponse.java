package org.fluxgate.studio.admin.controller;

import java.util.List;

public record MeResponse(String username, String name, List<String> roles, boolean canWrite) {}
