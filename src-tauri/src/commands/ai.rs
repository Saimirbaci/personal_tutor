use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc;

use crate::ai::{
    anthropic::AnthropicProvider,
    google::GoogleProvider,
    ollama::{fetch_installed_models, OllamaProvider},
    openrouter::{fetch_openrouter_models, OpenRouterModel, OpenRouterProvider},
    AiMessage, AiProvider, ProviderConfig,
};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProviderInfo {
    pub id: String,
    pub name: String,
    pub default_model: String,
    pub available_models: Vec<String>,
    pub requires_api_key: bool,
    pub base_url: Option<String>,
}

fn make_provider(config: ProviderConfig) -> Box<dyn AiProvider> {
    match config.provider.as_str() {
        "ollama" => Box::new(OllamaProvider::new(config)),
        "openrouter" => Box::new(OpenRouterProvider::new(config)),
        "google" => Box::new(GoogleProvider::new(config)),
        _ => Box::new(AnthropicProvider::new(config)),
    }
}

#[tauri::command]
pub async fn stream_chat(
    app: AppHandle,
    messages: Vec<AiMessage>,
    system: Option<String>,
    config: ProviderConfig,
) -> Result<(), String> {
    let provider = make_provider(config);

    let (tx, mut rx) = mpsc::channel::<String>(256);

    let app_clone = app.clone();

    tokio::spawn(async move {
        while let Some(token) = rx.recv().await {
            let _ = app_clone.emit("ai-token", token);
        }
    });

    match provider.stream_completion(messages, system, tx).await {
        Ok(_) => {
            let _ = app.emit("ai-done", ());
            Ok(())
        }
        Err(e) => {
            let err_msg = e.to_string();
            let _ = app.emit("ai-error", err_msg.clone());
            Err(err_msg)
        }
    }
}

/// Run a single non-streaming completion and return the full text.
///
/// Unlike `stream_chat`, this collects every token into a `String` and returns it
/// directly rather than emitting `ai-token`/`ai-done` events. Used by background
/// classification flows (e.g. session depth scoring) that need a one-shot result
/// without touching the live chat UI. Provider/API-key resolution stays on the
/// frontend via `config`, mirroring `stream_chat`.
#[tauri::command]
pub async fn collect_completion(
    messages: Vec<AiMessage>,
    system: Option<String>,
    config: ProviderConfig,
) -> Result<String, String> {
    let provider = make_provider(config);

    let (tx, mut rx) = mpsc::channel::<String>(256);

    let collector = tokio::spawn(async move {
        let mut buf = String::new();
        while let Some(token) = rx.recv().await {
            buf.push_str(&token);
        }
        buf
    });

    provider
        .stream_completion(messages, system, tx)
        .await
        .map_err(|e| e.to_string())?;

    collector.await.map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_providers() -> Vec<ProviderInfo> {
    vec![
        ProviderInfo {
            id: "anthropic".to_string(),
            name: "Anthropic".to_string(),
            default_model: "claude-sonnet-4-5".to_string(),
            available_models: vec![
                "claude-opus-4-5".to_string(),
                "claude-sonnet-4-5".to_string(),
                "claude-haiku-4-5".to_string(),
            ],
            requires_api_key: true,
            base_url: None,
        },
        ProviderInfo {
            id: "ollama".to_string(),
            name: "Ollama (Local)".to_string(),
            default_model: "llama3.2".to_string(),
            // Empty — frontend calls get_ollama_models() to populate dynamically
            available_models: vec![],
            requires_api_key: false,
            base_url: Some("http://localhost:11434".to_string()),
        },
        ProviderInfo {
            id: "openrouter".to_string(),
            name: "OpenRouter".to_string(),
            default_model: "anthropic/claude-3.5-sonnet".to_string(),
            // Empty — frontend calls get_openrouter_models() to populate dynamically
            available_models: vec![],
            requires_api_key: true,
            base_url: None,
        },
        ProviderInfo {
            id: "google".to_string(),
            name: "Google AI Studio".to_string(),
            default_model: "gemini-2.0-flash".to_string(),
            available_models: vec![
                "gemini-2.0-flash".to_string(),
                "gemini-2.0-flash-lite".to_string(),
                "gemini-1.5-pro".to_string(),
                "gemini-1.5-flash".to_string(),
            ],
            requires_api_key: true,
            base_url: None,
        },
    ]
}

/// Queries the locally running Ollama instance for installed models.
/// Returns a sorted list of model name strings, e.g. `["llama3.2:latest", "mistral:latest"]`.
/// Returns an error string if Ollama is not running or unreachable.
#[tauri::command]
pub async fn get_ollama_models(base_url: Option<String>) -> Result<Vec<String>, String> {
    let url = base_url
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| "http://localhost:11434".to_string());

    let mut models = fetch_installed_models(&url)
        .await
        .map_err(|e| e.to_string())?;

    models.sort();
    Ok(models)
}

/// Fetches the full OpenRouter model catalogue (public endpoint, no key required).
/// Returns rich model metadata so the frontend can render a searchable picker.
#[tauri::command]
pub async fn get_openrouter_models() -> Result<Vec<OpenRouterModel>, String> {
    fetch_openrouter_models().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_provider_config(
    app: AppHandle,
    config: ProviderConfig,
) -> Result<(), String> {
    use tauri_plugin_store::StoreExt;

    let store = app
        .store("settings.json")
        .map_err(|e| e.to_string())?;

    store.set(
        "provider_config",
        serde_json::to_value(config).map_err(|e| e.to_string())?,
    );

    store.save().map_err(|e| e.to_string())?;

    Ok(())
}
