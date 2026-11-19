package org.fluxgate.studio.admin.config.mvc;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.List;
import org.springframework.boot.autoconfigure.web.servlet.DispatcherServletAutoConfiguration;
import org.springframework.boot.autoconfigure.web.servlet.WebMvcProperties;
import org.springframework.boot.autoconfigure.web.servlet.WebMvcRegistrations;
import org.springframework.boot.autoconfigure.web.servlet.error.BasicErrorController;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.MethodParameter;
import org.springframework.core.ReactiveAdapterRegistry;
import org.springframework.core.ResolvableType;
import org.springframework.http.HttpEntity;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.method.support.HandlerMethodReturnValueHandler;
import org.springframework.web.method.support.HandlerMethodReturnValueHandlerComposite;
import org.springframework.web.method.support.ModelAndViewContainer;
import org.springframework.web.servlet.DispatcherServlet;
import org.springframework.web.servlet.HandlerMapping;
import org.springframework.web.servlet.ModelAndView;
import org.springframework.web.servlet.mvc.method.annotation.ExceptionHandlerExceptionResolver;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerAdapter;
import org.springframework.web.servlet.mvc.method.annotation.ResponseBodyEmitter;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

/** Studio serves its UI separately. Its servlet has no application templates or event streams. */
@Configuration(proxyBeanMethods = false)
public class StudioMvcRenderingConfig implements WebMvcRegistrations {

  @Bean(name = DispatcherServletAutoConfiguration.DEFAULT_DISPATCHER_SERVLET_BEAN_NAME)
  DispatcherServlet dispatcherServlet(WebMvcProperties properties) {
    DispatcherServlet servlet =
        new DispatcherServlet() {
          @Override
          protected void render(
              ModelAndView result, HttpServletRequest request, HttpServletResponse response)
              throws Exception {
            // Boot sets the HTTP status in errorHtml. Keep the HTML error route independent of
            // views.
            if (request.getAttribute(HandlerMapping.BEST_MATCHING_HANDLER_ATTRIBUTE)
                    instanceof HandlerMethod method
                && method.getBeanType() == BasicErrorController.class
                && method.getMethod().getName().equals("errorHtml")) {
              response.setContentType("text/html;charset=UTF-8");
              response
                  .getWriter()
                  .write(
                      "<!doctype html><title>Request failed</title><h1>HTTP "
                          + response.getStatus()
                          + "</h1>");
              return;
            }
            // Includes resolved and implicit names, direct View objects and exception resolver
            // results.
            response.setStatus(HttpServletResponse.SC_NOT_ACCEPTABLE);
          }
        };
    servlet.setDispatchOptionsRequest(properties.isDispatchOptionsRequest());
    servlet.setDispatchTraceRequest(properties.isDispatchTraceRequest());
    servlet.setPublishEvents(properties.isPublishRequestHandledEvents());
    servlet.setEnableLoggingRequestDetails(properties.isLogRequestDetails());
    return servlet;
  }

  @Override
  public RequestMappingHandlerAdapter getRequestMappingHandlerAdapter() {
    return new RequestMappingHandlerAdapter() {
      @Override
      public void afterPropertiesSet() {
        super.afterPropertiesSet();
        setReturnValueHandlers(
            guardStreams(getReturnValueHandlers(), getReactiveAdapterRegistry()));
      }
    };
  }

  @Override
  public ExceptionHandlerExceptionResolver getExceptionHandlerExceptionResolver() {
    return new ExceptionHandlerExceptionResolver() {
      @Override
      public void afterPropertiesSet() {
        super.afterPropertiesSet();
        setReturnValueHandlers(
            guardStreams(
                getReturnValueHandlers().getHandlers(),
                ReactiveAdapterRegistry.getSharedInstance()));
      }
    };
  }

  // Spring can render SSE fragments inside its emitter handler, before DispatcherServlet.render.
  // ResponseEntity<?> also chooses that handler from the actual body, regardless of Accept.
  private static List<HandlerMethodReturnValueHandler> guardStreams(
      List<HandlerMethodReturnValueHandler> handlers, ReactiveAdapterRegistry reactiveTypes) {
    HandlerMethodReturnValueHandlerComposite delegate =
        new HandlerMethodReturnValueHandlerComposite().addHandlers(handlers);
    return List.of(
        new HandlerMethodReturnValueHandler() {
          @Override
          public boolean supportsReturnType(MethodParameter type) {
            return delegate.supportsReturnType(type);
          }

          @Override
          public void handleReturnValue(
              Object value,
              MethodParameter type,
              ModelAndViewContainer container,
              NativeWebRequest request)
              throws Exception {
            Object body = value instanceof HttpEntity<?> entity ? entity.getBody() : value;
            Class<?> bodyType = body != null ? body.getClass() : type.getParameterType();
            if (body == null && HttpEntity.class.isAssignableFrom(bodyType)) {
              bodyType =
                  ResolvableType.forMethodParameter(type)
                      .as(HttpEntity.class)
                      .getGeneric()
                      .resolve();
            }
            if (bodyType != null
                && (ResponseBodyEmitter.class.isAssignableFrom(bodyType)
                    || StreamingResponseBody.class.isAssignableFrom(bodyType)
                    || reactiveTypes.getAdapter(bodyType) != null)) {
              request
                  .getNativeResponse(HttpServletResponse.class)
                  .setStatus(HttpServletResponse.SC_NOT_ACCEPTABLE);
              container.setRequestHandled(true);
              return;
            }
            delegate.handleReturnValue(value, type, container, request);
          }
        });
  }
}
