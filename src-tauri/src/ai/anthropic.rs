use anyhow::{anyhow, Result};
use async_trait::async_trait;
use futures_util::StreamExt;
use reqwest::Client;
use serde_json::{json, Value};
use tokio::sync::mpsc::Sender;

use super::provider::{AiMessage, AiProvider, ProviderConfig};

pub struct AnthropicProvider {
    pub config: ProviderConfig,
    pub client: Client,
}

impl AnthropicProvider {
    pub fn new(config: ProviderConfig) -> Self {
        Self {
            config,
            client: Client::new(),
        }
    }
}

#[async_trait]
impl AiProvider for AnthropicProvider {
    async fn stream_completion(
        &self,
        messages: Vec<AiMessage>,
        system: Option<String>,
        event_emitter: Sender<String>,
    ) -> Result<()> {
        let api_key = self
            .config
            .api_key
            .as_deref()
            .ok_or_else(|| anyhow!("Anthropic API key not set"))?;

        let anthropic_messages: Vec<Value> = messages
            .iter()
            .map(|m| {
                json!({
                    "role": m.role,
                    "content": m.content,
                })
            })
            .collect();

        let mut body = json!({
            "model": self.config.model,
            "max_tokens": 4096,
            "stream": true,
            "messages": anthropic_messages,
        });

        if let Some(sys) = system {
            body["system"] = json!(sys);
        }

        let response = self
            .client
            .post("https://api.anthropic.com/v1/messages")
            .header("x-api-key", api_key)
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json")
            .json(&body)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let err_text = response.text().await.unwrap_or_default();
            return Err(anyhow!("Anthropic API error {}: {}", status, err_text));
        }

        let mut stream = response.bytes_stream();

        while let Some(chunk) = stream.next().await {
            let chunk = chunk?;
            let text = String::from_utf8_lossy(&chunk);

            for line in text.lines() {
                if let Some(data) = line.strip_prefix("data: ") {
                    if data.trim() == "[DONE]" {
                        break;
                    }
                    if let Ok(parsed) = serde_json::from_str::<Value>(data) {
                        if parsed["type"] == "content_block_delta" {
                            if let Some(text_chunk) =
                                parsed["delta"]["text"].as_str()
                            {
                                let _ = event_emitter.send(text_chunk.to_string()).await;
                            }
                        }
                    }
                }
            }
        }

        Ok(())
    }

    fn default_model(&self) -> &str {
        "claude-sonnet-4-5"
    }

    fn available_models(&self) -> Vec<String> {
        vec![
            "claude-opus-4-5".to_string(),
            "claude-sonnet-4-5".to_string(),
            "claude-haiku-4-5".to_string(),
        ]
    }
}
