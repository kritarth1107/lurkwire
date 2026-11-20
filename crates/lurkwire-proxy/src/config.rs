use std::net::SocketAddr;
use std::path::PathBuf;

use clap::Parser;
use rustls_pki_types::CertificateDer;

fn default_data_dir() -> PathBuf {
    let base = std::env::var_os("XDG_DATA_HOME")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|home| PathBuf::from(home).join(".local/share")))
        .unwrap_or_else(|| PathBuf::from("."));
    base.join("lurkwire")
}

/// Lurkwire intercepting proxy sidecar.
#[derive(Debug, Clone, Parser)]
#[command(
    name = "lurkwire-proxy",
    version,
    about = "Lurkwire intercepting proxy sidecar"
)]
pub struct Args {
    /// Address the HTTP/HTTPS MITM proxy listens on.
    #[arg(long, default_value = "127.0.0.1:0")]
    pub listen: String,

    /// Address the authenticated control API listens on.
    #[arg(long, default_value = "127.0.0.1:0")]
    pub control: String,

    /// Directory for the CA, SQLite store, and body blobs.
    #[arg(long, env = "LURKWIRE_DATA_DIR", default_value_os_t = default_data_dir())]
    pub data_dir: PathBuf,

    /// Bearer token required by the control API. Generated if omitted.
    #[arg(long, env = "LURKWIRE_AUTH_TOKEN")]
    pub auth_token: Option<String>,
}

/// Runtime configuration for the sidecar.
#[derive(Debug, Clone)]
pub struct Config {
    pub listen: SocketAddr,
    pub control: SocketAddr,
    pub data_dir: PathBuf,
    pub auth_token: String,
    pub extra_roots: Vec<CertificateDer<'static>>,
}

impl Config {
    pub fn from_args(args: Args) -> anyhow::Result<Self> {
        let listen: SocketAddr = args
            .listen
            .parse()
            .map_err(|err| anyhow::anyhow!("invalid --listen {}: {err}", args.listen))?;
        let control: SocketAddr = args
            .control
            .parse()
            .map_err(|err| anyhow::anyhow!("invalid --control {}: {err}", args.control))?;
        let auth_token = args.auth_token.unwrap_or_else(generate_token);
        if auth_token.is_empty() {
            anyhow::bail!("auth token must not be empty");
        }
        Ok(Self {
            listen,
            control,
            data_dir: args.data_dir,
            auth_token,
            extra_roots: Vec::new(),
        })
    }

    pub fn for_test(data_dir: PathBuf, extra_roots: Vec<CertificateDer<'static>>) -> Self {
        Self {
            listen: "127.0.0.1:0".parse().expect("listen"),
            control: "127.0.0.1:0".parse().expect("control"),
            data_dir,
            auth_token: generate_token(),
            extra_roots,
        }
    }
}

pub fn generate_token() -> String {
    hex::encode(uuid::Uuid::new_v4().as_bytes()) + &hex::encode(uuid::Uuid::new_v4().as_bytes())
}
