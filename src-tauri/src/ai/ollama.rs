use anyhow::{anyhow, Result};
use async_trait::async_trait;
use futures_util::StreamExt;
use reqwest::Client;
use serde_json::{json, Value};
use tokio::sync::mpsc::Sender;

use super::provider::{AiMessage, AiProvider, ProviderConfig};

/// Queries the running Ollama instance for locally installed models.
/// Hits GET `{base_url}/api/tags` and returns model name strings
/// (e.g. `["llama3.2:latest", "mistral:latest"]`).
pub async fn fetch_installed_models(base_url: &str) -> Result<Vec<String>> {
    let client = Client::new();
    let url = format!("{}/api/tags", base_url);

    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| anyhow!("Cannot reach Ollama at {}: {}", base_url, e))?;

    if !resp.status().is_success() {
        return Err(anyhow!(
            "Ollama /api/tags returned HTTP {}",
            resp.status()
        ));
    }

    let body: Value = resp.json().await?;

    let models = body["models"]
        .as_array()
        .ok_or_else(|| anyhow!("Unexpected /api/tags response shape"))?
        .iter()
        .filter_map(|m| m["name"].as_str().map(str::to_owned))
        .collect();

    Ok(models)
}

pub struct OllamaProvider {
    pub config: ProviderConfig,
    pub client: Client,
}

impl OllamaProvider {
    pub fn new(config: ProviderConfig) -> Self {
        Self {
            config,
            client: Client::new(),
        }
    }
}

#[async_trait]
impl AiProvider for OllamaProvider {
    async fn stream_completion(
        &self,
        messages: Vec<AiMessage>,
        system: Option<String>,
        event_emitter: Sender<String>,
    ) -> Result<()> {
        let base_url = self
            .config
            .base_url
            .as_deref()
            .unwrap_or("http://localhost:11434");

        let url = format!("{}/api/chat", base_url);

        let mut ollama_messages: Vec<Value> = vec![];

        if let Some(sys) = system {
            ollama_messages.push(json!({
                "role": "system",
                "content": sys,
            }));
        }

        for m in &messages {
            ollama_messages.push(json!({
                "role": m.role,
                "content": m.content,
            }));
        }

        let body = json!({
            "model": self.config.model,
            "messages": ollama_messages,
            "stream": true,
        });

        let response = self
            .client
            .post(&url)
            .header("content-type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| anyhow!("Failed to connect to Ollama: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let err_text = response.text().await.unwrap_or_default();
            return Err(anyhow!("Ollama error {}: {}", status, err_text));
        }

        let mut stream = response.bytes_stream();
        let mut buffer = String::new();

        while let Some(chunk) = stream.next().await {
            let chunk = chunk?;
            buffer.push_str(&String::from_utf8_lossy(&chunk));

            while let Some(newline_pos) = buffer.find('\n') {
                let line = buffer[..newline_pos].trim().to_string();
                buffer = buffer[newline_pos + 1..].to_string();

                if line.is_empty() {
                    continue;
                }

                if let Ok(parsed) = serde_json::from_str::<Value>(&line) {
                    if let Some(content) = parsed["message"]["content"].as_str() {
                        let _ = event_emitter.send(content.to_string()).await;
                    }
                    if parsed["done"].as_bool().unwrap_or(false) {
                        return Ok(());
                    }
                }
            }
        }

        Ok(())
    }

    fn default_model(&self) -> &str {
        "llama3.2"
    }

    /// Returns an empty list — callers should use `fetch_installed_models()`
    /// to get the real list from the running Ollama instance.
    fn available_models(&self) -> Vec<String> {
        vec![]
    }
}
