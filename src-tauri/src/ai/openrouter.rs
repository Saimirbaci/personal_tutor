use anyhow::{anyhow, Result};
use async_trait::async_trait;
use futures_util::StreamExt;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tokio::sync::mpsc::Sender;

use super::provider::{AiMessage, AiProvider, ProviderConfig};

/// Metadata for a single OpenRouter model, returned by `/api/v1/models`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenRouterModel {
    pub id: String,
    pub name: String,
    pub context_length: Option<u64>,
    /// Cost per 1 000 000 prompt tokens (USD), empty string if free.
    pub pricing_prompt: String,
    /// Cost per 1 000 000 completion tokens (USD), empty string if free.
    pub pricing_completion: String,
}

/// Fetches the full model catalogue from `https://openrouter.ai/api/v1/models`.
/// The endpoint is public — no API key is required.
/// Returns models sorted by id for stable, predictable ordering.
pub async fn fetch_openrouter_models() -> Result<Vec<OpenRouterModel>> {
    let client = Client::new();

    let resp = client
        .get("https://openrouter.ai/api/v1/models")
        .header("content-type", "application/json")
        .send()
        .await
        .map_err(|e| anyhow!("Cannot reach OpenRouter: {}", e))?;

    if !resp.status().is_success() {
        return Err(anyhow!(
            "OpenRouter /api/v1/models returned HTTP {}",
            resp.status()
        ));
    }

    let body: Value = resp.json().await?;

    let models_raw = body["data"]
        .as_array()
        .ok_or_else(|| anyhow!("Unexpected /api/v1/models response shape"))?;

    let mut models: Vec<OpenRouterModel> = models_raw
        .iter()
        .filter_map(|m| {
            let id = m["id"].as_str()?.to_owned();
            let name = m["name"].as_str().unwrap_or(&id).to_owned();
            let context_length = m["context_length"].as_u64();
            let pricing_prompt = m["pricing"]["prompt"]
                .as_str()
                .unwrap_or("0")
                .to_owned();
            let pricing_completion = m["pricing"]["completion"]
                .as_str()
                .unwrap_or("0")
                .to_owned();
            Some(OpenRouterModel {
                id,
                name,
                context_length,
                pricing_prompt,
                pricing_completion,
            })
        })
        .collect();

    models.sort_by(|a, b| a.id.cmp(&b.id));
    Ok(models)
}

pub struct OpenRouterProvider {
    pub config: ProviderConfig,
    pub client: Client,
}

impl OpenRouterProvider {
    pub fn new(config: ProviderConfig) -> Self {
        Self {
            config,
            client: Client::new(),
        }
    }
}

#[async_trait]
impl AiProvider for OpenRouterProvider {
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
            .ok_or_else(|| anyhow!("OpenRouter API key not set"))?;

        let mut all_messages: Vec<Value> = vec![];

        if let Some(sys) = system {
            all_messages.push(json!({
                "role": "system",
                "content": sys,
            }));
        }

        for m in &messages {
            all_messages.push(json!({
                "role": m.role,
                "content": m.content,
            }));
        }

        let body = json!({
            "model": self.config.model,
            "messages": all_messages,
            "stream": true,
            "max_tokens": 4096,
        });

        let response = self
            .client
            .post("https://openrouter.ai/api/v1/chat/completions")
            .header("Authorization", format!("Bearer {}", api_key))
            .header("content-type", "application/json")
            .header("HTTP-Referer", "https://augmentifai.com")
            .header("X-Title", "Personal Tutor")
            .json(&body)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let err_text = response.text().await.unwrap_or_default();
            return Err(anyhow!("OpenRouter error {}: {}", status, err_text));
        }

        let mut stream = response.bytes_stream();

        while let Some(chunk) = stream.next().await {
            let chunk = chunk?;
            let text = String::from_utf8_lossy(&chunk);

            for line in text.lines() {
                if let Some(data) = line.strip_prefix("data: ") {
                    if data.trim() == "[DONE]" {
                        return Ok(());
                    }
                    if let Ok(parsed) = serde_json::from_str::<Value>(data) {
                        if let Some(content) = parsed["choices"][0]["delta"]["content"].as_str() {
                            let _ = event_emitter.send(content.to_string()).await;
                        }
                    }
                }
            }
        }

        Ok(())
    }

    fn default_model(&self) -> &str {
        "anthropic/claude-3.5-sonnet"
    }

    fn available_models(&self) -> Vec<String> {
        vec![
            "anthropic/claude-3.5-sonnet".to_string(),
            "anthropic/claude-3-haiku".to_string(),
            "openai/gpt-4o".to_string(),
            "openai/gpt-4o-mini".to_string(),
            "google/gemini-pro-1.5".to_string(),
            "meta-llama/llama-3.1-70b-instruct".to_string(),
            "mistralai/mixtral-8x7b-instruct".to_string(),
        ]
    }
}
