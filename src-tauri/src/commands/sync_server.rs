use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    middleware::{self, Next},
    response::{IntoResponse, Json, Response},
    routing::{get, post},
    Router,
};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::{net::UdpSocket, sync::Arc};
use tauri::{AppHandle, Manager};
use tokio::{sync::Mutex, task::AbortHandle};
use tower_http::cors::{Any, CorsLayer};

// ── Server handle stored as Tauri managed state ───────────────────────────────

pub struct SyncServerHandle(pub Mutex<Option<AbortHandle>>);

// ── Shared server state injected into axum routes ────────────────────────────

#[derive(Clone)]
struct ServerState {
    app: AppHandle,
    pin: String,
}

// ── Helper: get local LAN IP via UDP trick ────────────────────────────────────

pub fn get_local_ip() -> Option<String> {
    let socket = UdpSocket::bind("0.0.0.0:0").ok()?;
    socket.connect("8.8.8.8:80").ok()?;
    let addr = socket.local_addr().ok()?;
    Some(addr.ip().to_string())
}

// ── Auth middleware: check Authorization: Bearer <pin> ────────────────────────

async fn require_pin(
    State(state): State<Arc<ServerState>>,
    headers: HeaderMap,
    request: axum::extract::Request,
    next: Next,
) -> Response {
    let auth = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    let expected = format!("Bearer {}", state.pin);
    if auth != expected {
        return (StatusCode::UNAUTHORIZED, "Invalid PIN").into_response();
    }
    next.run(request).await
}

// ── Response types ────────────────────────────────────────────────────────────

#[derive(Serialize)]
struct ConversationJson {
    id: String,
    title: String,
    pillar: Option<String>,
    created_at: String,
    updated_at: String,
    message_count: i64,
}

#[derive(Serialize)]
struct MessageJson {
    id: String,
    conversation_id: String,
    role: String,
    content: String,
    genui: Option<String>,
    created_at: String,
}

#[derive(Deserialize)]
struct BulkPayload {
    conversations: Vec<ConversationImport>,
    messages: Vec<MessageImport>,
}

#[derive(Deserialize)]
struct ConversationImport {
    id: String,
    title: String,
    pillar: Option<String>,
    created_at: String,
    updated_at: String,
}

#[derive(Deserialize)]
struct MessageImport {
    id: String,
    conversation_id: String,
    role: String,
    content: String,
    genui: Option<String>,
    created_at: String,
}

// ── Route handlers ────────────────────────────────────────────────────────────

async fn ping() -> &'static str {
    "pong"
}

async fn list_conversations(State(state): State<Arc<ServerState>>) -> Response {
    let db_path = match crate::db::get_db_path(&state.app) {
        Ok(p) => p,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };

    match Connection::open(&db_path) {
        Ok(conn) => {
            let mut stmt = match conn.prepare(
                "SELECT id, title, pillar, created_at, updated_at,
                 (SELECT COUNT(*) FROM chat_messages WHERE conversation_id = c.id) as message_count
                 FROM conversations c ORDER BY updated_at DESC",
            ) {
                Ok(s) => s,
                Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
            };

            let rows: Result<Vec<ConversationJson>, _> = stmt
                .query_map([], |row| {
                    Ok(ConversationJson {
                        id: row.get(0)?,
                        title: row.get(1)?,
                        pillar: row.get(2)?,
                        created_at: row.get(3)?,
                        updated_at: row.get(4)?,
                        message_count: row.get(5)?,
                    })
                })
                .and_then(|r| r.collect());

            match rows {
                Ok(data) => Json(data).into_response(),
                Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
            }
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

async fn get_messages(
    State(state): State<Arc<ServerState>>,
    Path(conversation_id): Path<String>,
) -> Response {
    let db_path = match crate::db::get_db_path(&state.app) {
        Ok(p) => p,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };

    match Connection::open(&db_path) {
        Ok(conn) => {
            let mut stmt = match conn.prepare(
                "SELECT id, conversation_id, role, content, genui, created_at
                 FROM chat_messages WHERE conversation_id = ?1 ORDER BY created_at ASC",
            ) {
                Ok(s) => s,
                Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
            };

            let rows: Result<Vec<MessageJson>, _> = stmt
                .query_map([&conversation_id], |row| {
                    Ok(MessageJson {
                        id: row.get(0)?,
                        conversation_id: row.get(1)?,
                        role: row.get(2)?,
                        content: row.get(3)?,
                        genui: row.get(4)?,
                        created_at: row.get(5)?,
                    })
                })
                .and_then(|r| r.collect());

            match rows {
                Ok(data) => Json(data).into_response(),
                Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
            }
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

/// POST /bulk — mobile pushes its local conversations+messages to desktop
async fn bulk_import(
    State(state): State<Arc<ServerState>>,
    Json(payload): Json<BulkPayload>,
) -> Response {
    let db_path = match crate::db::get_db_path(&state.app) {
        Ok(p) => p,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    };

    match Connection::open(&db_path) {
        Ok(conn) => {
            for c in &payload.conversations {
                let _ = conn.execute(
                    "INSERT OR REPLACE INTO conversations (id, title, pillar, created_at, updated_at)
                     VALUES (?1, ?2, ?3, ?4, ?5)",
                    rusqlite::params![c.id, c.title, c.pillar, c.created_at, c.updated_at],
                );
            }
            for m in &payload.messages {
                let _ = conn.execute(
                    "INSERT OR IGNORE INTO chat_messages
                     (id, conversation_id, role, content, genui, created_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                    rusqlite::params![
                        m.id, m.conversation_id, m.role,
                        m.content, m.genui, m.created_at
                    ],
                );
            }
            (StatusCode::OK, "ok").into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response(),
    }
}

// ── Tauri commands ─────────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct SyncServerInfo {
    pub running: bool,
    pub local_ip: Option<String>,
    pub port: u16,
}

#[tauri::command]
pub async fn start_sync_server(
    app: AppHandle,
    pin: String,
    port: Option<u16>,
) -> Result<SyncServerInfo, String> {
    let handle = app.state::<SyncServerHandle>();
    let mut lock = handle.0.lock().await;

    // If already running, abort first
    if let Some(h) = lock.take() {
        h.abort();
    }

    let port = port.unwrap_or(7432);
    let local_ip = get_local_ip();

    let state = Arc::new(ServerState {
        app: app.clone(),
        pin: pin.clone(),
    });

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let protected = Router::new()
        .route("/conversations", get(list_conversations))
        .route("/conversations/:id/messages", get(get_messages))
        .route("/bulk", post(bulk_import))
        .layer(middleware::from_fn_with_state(state.clone(), require_pin));

    let app_router = Router::new()
        .route("/ping", get(ping))
        .merge(protected)
        .layer(cors)
        .with_state(state);

    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{}", port))
        .await
        .map_err(|e| e.to_string())?;

    let task = tokio::spawn(async move {
        let _ = axum::serve(listener, app_router).await;
    });

    *lock = Some(task.abort_handle());

    Ok(SyncServerInfo {
        running: true,
        local_ip,
        port,
    })
}

#[tauri::command]
pub async fn stop_sync_server(app: AppHandle) -> Result<(), String> {
    let handle = app.state::<SyncServerHandle>();
    let mut lock = handle.0.lock().await;
    if let Some(h) = lock.take() {
        h.abort();
    }
    Ok(())
}

#[tauri::command]
pub async fn get_sync_server_status(app: AppHandle) -> Result<SyncServerInfo, String> {
    let handle = app.state::<SyncServerHandle>();
    let lock = handle.0.lock().await;
    let running = lock.is_some();
    Ok(SyncServerInfo {
        running,
        local_ip: get_local_ip(),
        port: 7432,
    })
}
