import java.util.List;
import java.util.Map;

public class Example {
    public static void main(String[] args) throws Exception {
        // ⚡ 5-Line Sovereign Agent with REAL-TIME MCP Tool in Java
        LiateAgent agent = new LiateAgent(
            "sarvam/sarvam-105b",
            "session_java_live",
            "Time Agent",
            "Fetch live real-time clock for any timezone",
            "uvx",
            List.of("mcp-server-time"),
            Map.of("SARVAM_API_KEY", System.getenv().getOrDefault("SARVAM_API_KEY", "")),
            null
        );

        System.out.println("🚀 Running REAL LIVE MCP Agent in Java...");
        String response = agent.run("What is the exact live current time in Mumbai right now? Use your real-time tool.");
        System.out.println("\n--- LIVE REAL AGENT OUTPUT (JAVA) ---");
        System.out.println(response);
    }
}
