use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::HashMap;
use std::env;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolServer {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub command: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub args: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Pillars {
    pub l: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub i: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub a: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub t: Option<HashMap<String, ToolServer>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub e: Option<HashMap<String, String>>,
}

pub struct LiateAgent {
    pub spec: serde_json::Value,
    pub endpoint: String,
    pub api_key: Option<String>,
}

impl LiateAgent {
    pub fn new(spec: serde_json::Value) -> Self {
        let endpoint = env::var("LIATE_ENDPOINT")
            .or_else(|_| env::var("LIATE_BASE_URL"))
            .unwrap_or_else(|_| "http://localhost:7071".to_string());
        let api_key = env::var("LIATE_API_KEY").ok();
        Self { spec, endpoint, api_key }
    }

    pub fn with_endpoint(mut self, endpoint: impl Into<String>) -> Self {
        self.endpoint = endpoint.into();
        self
    }

    pub fn with_api_key(mut self, key: impl Into<String>) -> Self {
        self.api_key = Some(key.into());
        self
    }

    pub fn run(&self, prompt: &str) -> Result<String, Box<dyn std::error::Error>> {
        let agent_name = self.spec.get("A")
            .and_then(|a| a.get("name"))
            .and_then(|n| n.as_str())
            .unwrap_or("default");

        let url = format!("{}/lapi/v1/{}/run", self.endpoint.trim_end_matches('/'), agent_name);

        let payload = json!({
            "spec": self.spec,
            "prompt": prompt
        });

        let mut req = ureq::post(&url).set("Content-Type", "application/json");
        if let Some(key) = &self.api_key {
            req = req.set("Authorization", &format!("Bearer {}", key));
        }

        let res: serde_json::Value = req.send_json(payload)?.into_json()?;

        if let Some(out) = res.get("response").or_else(|| res.get("output")).or_else(|| res.get("result")) {
            Ok(out.as_str().unwrap_or(&out.to_string()).to_string())
        } else {
            Ok(res.to_string())
        }
    }
}
