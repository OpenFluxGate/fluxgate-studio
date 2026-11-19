package org.fluxgate.studio.admin.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletResponse;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Callable;
import java.util.concurrent.atomic.AtomicInteger;
import org.fluxgate.studio.admin.config.mvc.StudioMvcRenderingConfig;
import org.fluxgate.studio.admin.controller.DecisionEventController;
import org.fluxgate.studio.admin.exception.GlobalExceptionHandler;
import org.fluxgate.studio.admin.monitoring.DecisionEventPage;
import org.fluxgate.studio.admin.monitoring.MongoDecisionEventStore;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.ImportAutoConfiguration;
import org.springframework.boot.autoconfigure.http.HttpMessageConvertersAutoConfiguration;
import org.springframework.boot.autoconfigure.jackson.JacksonAutoConfiguration;
import org.springframework.boot.autoconfigure.web.servlet.DispatcherServletAutoConfiguration;
import org.springframework.boot.autoconfigure.web.servlet.ServletWebServerFactoryAutoConfiguration;
import org.springframework.boot.autoconfigure.web.servlet.WebMvcAutoConfiguration;
import org.springframework.boot.autoconfigure.web.servlet.error.ErrorMvcAutoConfiguration;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestComponent;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.core.Ordered;
import org.springframework.http.ResponseEntity;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseBody;
import org.springframework.web.servlet.ModelAndView;
import org.springframework.web.servlet.View;
import org.springframework.web.servlet.ViewResolver;
import org.springframework.web.servlet.handler.SimpleUrlHandlerMapping;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import org.springframework.web.servlet.view.FragmentsRendering;

@SpringBootTest(
    classes = StudioMvcRenderingTest.App.class,
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class StudioMvcRenderingTest {
  @TestComponent
  @Configuration(proxyBeanMethods = false)
  @ImportAutoConfiguration({
    ServletWebServerFactoryAutoConfiguration.class,
    DispatcherServletAutoConfiguration.class,
    WebMvcAutoConfiguration.class,
    ErrorMvcAutoConfiguration.class,
    JacksonAutoConfiguration.class,
    HttpMessageConvertersAutoConfiguration.class,
    org.springdoc.core.configuration.SpringDocConfiguration.class,
    org.springdoc.core.properties.SpringDocConfigProperties.class,
    org.springdoc.core.configuration.SpringDocSpecPropertiesConfiguration.class,
    org.springdoc.webmvc.core.configuration.SpringDocWebMvcConfiguration.class,
    org.springdoc.webmvc.ui.SwaggerConfig.class,
    org.springdoc.core.properties.SwaggerUiConfigProperties.class,
    org.springdoc.core.properties.SwaggerUiOAuthProperties.class
  })
  @Import({
    StudioMvcRenderingConfig.class,
    FutureController.class,
    DecisionEventController.class,
    GlobalExceptionHandler.class
  })
  static class App {
    @Bean
    ViewResolver markerResolver(FutureController controller) {
      return (name, locale) -> {
        controller.resolutions.incrementAndGet();
        return controller.marker;
      };
    }

    @Bean
    SimpleUrlHandlerMapping plainMapping(FutureController controller) {
      org.springframework.web.servlet.mvc.Controller handler =
          (request, response) -> new ModelAndView(controller.marker);
      return new SimpleUrlHandlerMapping(
          Map.of("/future/non-annotated", handler), Ordered.HIGHEST_PRECEDENCE);
    }
  }

  @Controller
  @TestComponent
  static class FutureController {
    final AtomicInteger resolutions = new AtomicInteger();
    final AtomicInteger renders = new AtomicInteger();
    final AtomicInteger emitterStarts = new AtomicInteger();
    final View marker = (model, request, response) -> renders.incrementAndGet();

    @GetMapping("/future/direct")
    View direct() {
      return marker;
    }

    @GetMapping("/future/named")
    String named() {
      return "marker";
    }

    @GetMapping("/future/implicit")
    void implicit() {}

    @GetMapping("/future/async-view")
    Callable<ModelAndView> asyncView() {
      return () -> new ModelAndView(marker);
    }

    @GetMapping("/future/fragments")
    FragmentsRendering fragments() {
      return FragmentsRendering.fragments(List.of(new ModelAndView(marker))).build();
    }

    @GetMapping("/future/collection")
    List<ModelAndView> collection() {
      return List.of(new ModelAndView(marker));
    }

    @GetMapping(value = "/future/emitter", produces = "text/event-stream")
    SseEmitter emitter() {
      return new SseEmitter() {
        @Override
        protected void extendResponse(ServerHttpResponse response) {
          emitterStarts.incrementAndGet();
        }
      };
    }

    @GetMapping("/future/entity")
    ResponseEntity<Object> entity() {
      return ResponseEntity.ok(emitter());
    }

    @GetMapping("/future/streaming")
    ResponseEntity<Object> streaming() {
      org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody body =
          stream -> emitterStarts.incrementAndGet();
      return ResponseEntity.ok(body);
    }

    @GetMapping("/future/deferred")
    org.springframework.web.context.request.async.DeferredResult<ResponseEntity<Object>>
        deferred() {
      var result =
          new org.springframework.web.context.request.async.DeferredResult<
              ResponseEntity<Object>>();
      result.setResult(entity());
      return result;
    }

    @GetMapping("/future/async-emitter")
    Callable<SseEmitter> asyncEmitter() {
      return this::emitter;
    }

    @GetMapping("/future/empty-emitter")
    ResponseEntity<SseEmitter> emptyEmitter() {
      return ResponseEntity.ok().build();
    }

    @GetMapping("/future/reactive")
    ResponseEntity<Object> reactive() {
      return ResponseEntity.ok(java.util.concurrent.CompletableFuture.completedFuture("marker"));
    }

    @GetMapping("/future/advice-view")
    String adviceView() {
      throw new UnsupportedOperationException();
    }

    @ExceptionHandler(UnsupportedOperationException.class)
    ModelAndView failedView() {
      return new ModelAndView(marker);
    }

    @GetMapping("/future/advice")
    String advice() {
      throw new IllegalStateException();
    }

    @ExceptionHandler(IllegalStateException.class)
    ResponseEntity<Object> failed() {
      return entity();
    }

    @GetMapping("/future/no-content")
    ResponseEntity<Void> empty() {
      return ResponseEntity.noContent().build();
    }

    @GetMapping("/future/error-dispatch")
    void error(HttpServletResponse response) throws Exception {
      response.sendError(418);
    }

    @PostMapping("/future/json")
    @ResponseBody
    ResponseEntity<Object> echo(@RequestBody Map<String, Object> json) {
      return ResponseEntity.status(201).header("ETag", "\"one\"").body(json);
    }
  }

  @LocalServerPort int port;
  @Autowired FutureController fixture;
  @Autowired ObjectMapper mapper;
  @MockBean MongoDecisionEventStore store;
  final HttpClient client = HttpClient.newHttpClient();

  HttpRequest.Builder request(String path) {
    return HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + path))
        .timeout(Duration.ofSeconds(8));
  }

  HttpResponse<String> get(String path, String accept) throws Exception {
    var request = request(path);
    if (accept != null) request.header("Accept", accept);
    return client.send(request.build(), HttpResponse.BodyHandlers.ofString());
  }

  @Test
  void directNamedImplicitNestedAndExceptionIndependentViewsNeverReachResolutionOrRender()
      throws Exception {
    for (String route :
        List.of(
            "direct",
            "named",
            "implicit",
            "async-view",
            "fragments",
            "collection",
            "advice-view",
            "non-annotated")) {
      var result = get("/future/" + route, null);
      assertThat(result.statusCode()).as(route).isEqualTo(406);
      assertThat(result.body()).as(route).isEmpty();
    }
    assertThat(fixture.resolutions).hasValue(0);
    assertThat(fixture.renders).hasValue(0);
  }

  @Test
  void emitterAndOpaqueEntityAreRejectedBeforeAsyncStreamingRegardlessOfAccept() throws Exception {
    for (String route :
        List.of(
            "emitter",
            "entity",
            "async-emitter",
            "empty-emitter",
            "advice",
            "reactive",
            "streaming",
            "deferred")) {
      for (String accept :
          new String[] {
            null, "*/*", "text/event-stream", "application/json, text/event-stream;q=0.5"
          }) {
        var result = get("/future/" + route, accept);
        assertThat(result.statusCode()).as("%s %s", route, accept).isEqualTo(406);
        assertThat(result.body()).as(route).isEmpty();
      }
    }
    assertThat(fixture.emitterStarts).hasValue(0);
  }

  @Test
  void ordinaryJsonEntityAndDecisionPaginationKeepTheirContract() throws Exception {
    var post =
        request("/future/json")
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString("{\"ok\":true}"))
            .build();
    var created = client.send(post, HttpResponse.BodyHandlers.ofString());
    assertThat(created.statusCode()).isEqualTo(201);
    assertThat(created.headers().firstValue("ETag")).contains("\"one\"");
    assertThat(mapper.readTree(created.body()).get("ok").asBoolean()).isTrue();
    when(store.search(any())).thenReturn(new DecisionEventPage(List.of(), null));
    for (String accept :
        new String[] {
          null, "*/*", "application/json", "text/event-stream, application/json;q=0.5"
        }) {
      var event = get("/api/events?from=1&to=100", accept);
      assertThat(event.statusCode()).isEqualTo(200);
      assertThat(event.headers().firstValue("Content-Type")).contains("application/json");
      assertThat(mapper.readTree(event.body()).get("items").isArray()).isTrue();
    }
    assertThat(get("/api/events?from=1&to=100", "text/event-stream").statusCode()).isEqualTo(406);
    assertThat(get("/api/events", "application/json").statusCode()).isEqualTo(400);
  }

  @Test
  void swaggerRedirectAndUiAssetsRemainAvailable() throws Exception {
    var redirect = get("/swagger-ui.html", "text/html");
    assertThat(redirect.statusCode()).isBetween(300, 399);
    String location = redirect.headers().firstValue("Location").orElseThrow();
    assertThat(location).endsWith("/swagger-ui/index.html");
    var index = get(URI.create(location).getPath(), "text/html");
    assertThat(index.statusCode()).isEqualTo(200);
    assertThat(index.body()).contains("swagger-ui-bundle.js");
    var bundle = get("/swagger-ui/swagger-ui-bundle.js", "*/*");
    assertThat(bundle.statusCode()).isEqualTo(200);
    assertThat(bundle.body()).contains("SwaggerUIBundle");
  }

  @Test
  void containerErrorDispatchPreservesItsStatusAndNegotiation() throws Exception {
    var html = get("/future/error-dispatch", "text/html");
    assertThat(html.statusCode()).isEqualTo(418);
    assertThat(html.headers().firstValue("Content-Type").orElseThrow()).startsWith("text/html");
    assertThat(html.body()).contains("HTTP 418");
    var head =
        request("/future/error-dispatch")
            .header("Accept", "text/html")
            .method("HEAD", HttpRequest.BodyPublishers.noBody())
            .build();
    var headers = client.send(head, HttpResponse.BodyHandlers.ofString());
    assertThat(headers.statusCode()).isEqualTo(418);
    assertThat(headers.body()).isEmpty();
    var empty = get("/future/no-content", null);
    assertThat(empty.statusCode()).isEqualTo(204);
    assertThat(empty.body()).isEmpty();
    var json = get("/future/error-dispatch", "application/json");
    assertThat(json.statusCode()).isEqualTo(418);
    assertThat(mapper.readTree(json.body()).get("status").asInt()).isEqualTo(418);
    assertThat(fixture.resolutions).hasValue(0);
  }
}
