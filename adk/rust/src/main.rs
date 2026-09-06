use serde_json::json;
use std::env;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let endpoint = env::var("LIATE_ENDPOINT").unwrap_or_else(|_| "http://localhost:7071".to_string());
    let sarvam_key = env::var("SARVAM_API_KEY").unwrap_or_default();

    // ⚡ 5-Line Sovereign Agent with REAL-TIME MCP Tool in Rust
    let spec = json!({
        "L": "sarvam/sarvam-105b",
        "I": { "memory": "session_rust_live" },
        "A": { "name": "Time Agent", "intent": "Fetch live real-time clock for any timezone" },
        "T": { "time": { "command": "uvx", "args": ["mcp-server-time"] } },
        "E": { "SARVAM_API_KEY": sarvam_key }
    });

    println!("🚀 Running REAL LIVE MCP Agent in Rust...");

    let payload = json!({
        "spec": spec,
        "prompt": "What is the exact live current time in Mumbai right now? Use your real-time tool."
    });

    let res: serde_json::Value = ureq::post(&format!("{}/api/agent/run", endpoint))
        .set("Content-Type", "application/json")
        .send_json(payload)?
        .into_json()?;

    println!("\n--- LIVE REAL AGENT OUTPUT (RUST) ---");
    if let Some(output) = res.get("response").or_else(|| res.get("output")) {
        println!("{}", output.as_str().unwrap_or(&output.to_string()));
    } else {
        println!("{}", res);
    }

    Ok(())
}
