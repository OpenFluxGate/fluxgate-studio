import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.Objects;

/** The response identifies the JAR loaded by this process, independently of its current path. */
public final class Identity {
    public static void main(String[] args) throws Exception {
        byte[] identity;
        try (var resource = Objects.requireNonNull(Identity.class.getResourceAsStream("/version"))) {
            identity = new String(resource.readAllBytes(), StandardCharsets.UTF_8)
                    .trim().getBytes(StandardCharsets.UTF_8);
        }
        var server = HttpServer.create(new InetSocketAddress("127.0.0.1", 8081), 0);
        server.createContext("/actuator/health", exchange -> {
            byte[] body = "{\"status\":\"UP\"}".getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, body.length);
            try (var output = exchange.getResponseBody()) {
                output.write(body);
            }
        });
        server.createContext("/fixture-identity", exchange -> {
            exchange.sendResponseHeaders(200, identity.length);
            try (var output = exchange.getResponseBody()) {
                output.write(identity);
            }
        });
        server.start();
    }
}
