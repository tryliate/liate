import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.Map;
import java.util.List;

public class LiateAgent {
    private final String model;
    private final String memory;
    private final String name;
    private final String intent;
    private final String toolCommand;
    private final List<String> toolArgs;
    private final Map<String, String> env;
    private final String endpoint;
    private final String apiKey;
    private final HttpClient client;

    public LiateAgent(String model, String memory, String name, String intent, String toolCommand, List<String> toolArgs, Map<String, String> env, String endpoint) {
        this.model = model;
        this.memory = memory != null ? memory : "session_java_live";
        this.name = name != null ? name : "default";
        this.intent = intent;
        this.toolCommand = toolCommand;
        this.toolArgs = toolArgs != null ? toolArgs : List.of();
        this.env = env != null ? env : Map.of();
        this.endpoint = endpoint != null ? endpoint : System.getenv().getOrDefault("LIATE_ENDPOINT", "http://localhost:7071");
        this.apiKey = System.getenv("LIATE_API_KEY");
        this.client = HttpClient.newHttpClient();
    }

    public String run(String prompt) throws Exception {
        String jsonPayload = String.format(
            "{\"spec\":{\"L\":\"%s\",\"I\":{\"memory\":\"%s\"},\"A\":{\"name\":\"%s\",\"intent\":\"%s\"},\"T\":{\"time\":{\"command\":\"%s\",\"args\":%s}},\"E\":%s},\"prompt\":\"%s\"}",
            model, memory, name, intent, toolCommand,
            toJsonArray(toolArgs), toJsonMap(env),
            prompt.replace("\"", "\\\"")
        );

        String base = endpoint.replaceAll("/+$", "");
        String url = base + "/lapi/v1/" + name + "/run";

        HttpRequest.Builder builder = HttpRequest.newBuilder()
            .uri(URI.create(url))
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(jsonPayload));

        if (apiKey != null && !apiKey.isEmpty()) {
            builder.header("Authorization", "Bearer " + apiKey);
        }

        HttpRequest request = builder.build();
        HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());

        if (response.statusCode() >= 400) {
            // Fallback to /api/agent/run
            String fallbackUrl = base + "/api/agent/run";
            HttpRequest.Builder fallbackBuilder = HttpRequest.newBuilder()
                .uri(URI.create(fallbackUrl))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(jsonPayload));
            if (apiKey != null && !apiKey.isEmpty()) {
                fallbackBuilder.header("Authorization", "Bearer " + apiKey);
            }
            response = client.send(fallbackBuilder.build(), HttpResponse.BodyHandlers.ofString());
        }

        return response.body();
    }

    private static String toJsonArray(List<String> list) {
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < list.size(); i++) {
            sb.append("\"").append(list.get(i)).append("\"");
            if (i < list.size() - 1) sb.append(",");
        }
        return sb.append("]").toString();
    }

    private static String toJsonMap(Map<String, String> map) {
        StringBuilder sb = new StringBuilder("{");
        int count = 0;
        for (var entry : map.entrySet()) {
            sb.append("\"").append(entry.getKey()).append("\":\"").append(entry.getValue()).append("\"");
            if (++count < map.size()) sb.append(",");
        }
        return sb.append("}").toString();
    }
}
