use anyhow::Result;
use clap::Parser;
use lurkwire_proxy::config::{Args, Config};
use lurkwire_proxy::RunningProxy;
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .with_writer(std::io::stderr)
        .init();

    let args = Args::parse();
    let config = Config::from_args(args)?;
    let running = RunningProxy::start(config).await?;
    let line = serde_json::to_string(&running.ready)?;
    println!("{line}");
    use std::io::Write;
    std::io::stdout().flush().ok();
    tracing::info!(
        proxy = %running.ready.proxy_listen,
        control = %running.ready.control_listen,
        ca = %running.ready.ca_path,
        "lurkwire-proxy ready"
    );

    tokio::signal::ctrl_c().await.ok();
    tracing::info!("shutting down");
    running.join().await;
    Ok(())
}
