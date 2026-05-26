use anyhow::{anyhow, Result};
use async_trait::async_trait;
use futures_util::StreamExt;
use reqwest::Client;
use serde_json::{json, Value};
use tokio::sync::mpsc::Sender;

use super::provider::{AiMessage, AiProvider, ProviderConfig};

pub struct GoogleProvider {
    pub config: ProviderConfig,
    pub client: Client,
}

impl GoogleProvider {
    pub fn new(config: ProviderConfig) -> Self {
        Self {
            config,
            client: Client::new(),
        }
    }
}

#[async_trait]
impl AiProvider for GoogleProvider {
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
            .ok_or_else(|| anyhow!("Google AI API key not set"))?;

        let model = &self.config.model;
        let url = format!(
            "https://generativelanguage.googleapis.com/v1beta/models/{}:streamGenerateContent?key={}&alt=sse",
            model, api_key
        );

        // Convert messages to Google format
        let mut google_contents: Vec<Value> = vec![];

        for m in &messages {
            let role = match m.role.as_str() {
                "assistant" => "model",
                other => other,
            };
            google_contents.push(json!({
                "role": role,
                "parts": [{ "text": m.content }],
            }));
        }

        let mut body = json!({
            "contents": google_contents,
            "generationConfig": {
                "maxOutputTokens": 4096,
                "temperature": 0.7,
            },
        });

        if let Some(sys) = system {
            body["systemInstruction"] = json!({
                "parts": [{ "text": sys }]
            });
        }

        let response = self
            .client
            .post(&url)
            .header("content-type", "application/json")
            .json(&body)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let err_text = response.text().await.unwrap_or_default();
            return Err(anyhow!("Google AI error {}: {}", status, err_text));
        }

        let mut stream = response.bytes_stream();

        while let Some(chunk) = stream.next().await {
            let chunk = chunk?;
            let text = String::from_utf8_lossy(&chunk);

            for line in text.lines() {
                if let Some(data) = line.strip_prefix("data: ") {
                    if let Ok(parsed) = serde_json::from_str::<Value>(data) {
                        if let Some(text_part) =
                            parsed["candidates"][0]["content"]["parts"][0]["text"].as_str()
                        {
                            let _ = event_emitter.send(text_part.to_string()).await;
                        }
                    }
                }
            }
        }

        Ok(())
    }

    fn default_model(&self) -> &str {
        "gemini-2.0-flash"
    }

    fn available_models(&self) -> Vec<String> {
        vec![
            "gemini-2.0-flash".to_string(),
            "gemini-2.0-flash-lite".to_string(),
            "gemini-1.5-pro".to_string(),
            "gemini-1.5-flash".to_string(),
        ]
    }
}
