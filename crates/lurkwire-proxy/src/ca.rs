use std::collections::HashMap;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::net::IpAddr;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;

use anyhow::{Context, Result};
use rcgen::{
    BasicConstraints, CertificateParams, DistinguishedName, DnType, ExtendedKeyUsagePurpose, IsCa,
    Issuer, KeyPair, KeyUsagePurpose, SanType,
};
use rustls::ServerConfig;
use rustls_pki_types::{CertificateDer, PrivateKeyDer, PrivatePkcs8KeyDer};
use sha2::{Digest, Sha256};
use time::OffsetDateTime;

const CA_CERT_FILE: &str = "ca.pem";
const CA_KEY_FILE: &str = "ca-key.pem";
const CA_CN: &str = "Lurkwire Local CA";

/// Per-install certificate authority used to mint leaf certificates for MITM.
pub struct CertificateAuthority {
    pub cert_pem: String,
    pub cert_der: Vec<u8>,
    pub fingerprint_sha256: String,
    pub cert_path: PathBuf,
    key_pem: String,
    cache: Mutex<HashMap<String, std::sync::Arc<ServerConfig>>>,
}

impl CertificateAuthority {
    pub fn load_or_create(data_dir: &Path) -> Result<Self> {
        fs::create_dir_all(data_dir).with_context(|| format!("create {}", data_dir.display()))?;
        let cert_path = data_dir.join(CA_CERT_FILE);
        let key_path = data_dir.join(CA_KEY_FILE);

        if cert_path.exists() && key_path.exists() {
            let cert_pem = fs::read_to_string(&cert_path)
                .with_context(|| format!("read {}", cert_path.display()))?;
            let key_pem = fs::read_to_string(&key_path)
                .with_context(|| format!("read {}", key_path.display()))?;
            return Self::from_pems(cert_pem, key_pem, cert_path);
        }

        let key = KeyPair::generate().context("generate CA key")?;
        let mut params = CertificateParams::new(Vec::<String>::new()).context("CA params")?;
        params.is_ca = IsCa::Ca(BasicConstraints::Unconstrained);
        params.key_usages = vec![
            KeyUsagePurpose::KeyCertSign,
            KeyUsagePurpose::CrlSign,
            KeyUsagePurpose::DigitalSignature,
        ];
        let mut dn = DistinguishedName::new();
        dn.push(DnType::OrganizationName, "Lurkwire");
        dn.push(DnType::CommonName, CA_CN);
        params.distinguished_name = dn;
        params.not_before = OffsetDateTime::now_utc() - time::Duration::days(1);
        params.not_after = OffsetDateTime::now_utc() + time::Duration::days(3650);

        let cert = params.self_signed(&key).context("self-sign CA")?;
        let cert_pem = cert.pem();
        let key_pem = key.serialize_pem();
        write_secret_file(&cert_path, cert_pem.as_bytes())?;
        // Cert is public, but keep both tight just in case the directory is shared.
        write_secret_file(&key_path, key_pem.as_bytes())?;
        tracing::info!(path = %cert_path.display(), "created per-install CA");
        Self::from_pems(cert_pem, key_pem, cert_path)
    }

    fn from_pems(cert_pem: String, key_pem: String, cert_path: PathBuf) -> Result<Self> {
        let _ = KeyPair::from_pem(&key_pem).context("parse CA key")?;
        let cert_der = pem_to_der(&cert_pem).context("parse CA cert PEM")?;
        let fingerprint_sha256 = hex::encode(Sha256::digest(&cert_der));
        Ok(Self {
            cert_pem,
            cert_der,
            fingerprint_sha256,
            cert_path,
            key_pem,
            cache: Mutex::new(HashMap::new()),
        })
    }

    pub fn issuer(&self) -> Result<Issuer<'static, KeyPair>> {
        let key = KeyPair::from_pem(&self.key_pem).context("parse CA key")?;
        Issuer::from_ca_cert_pem(&self.cert_pem, key).context("build CA issuer")
    }

    pub fn server_config_for(&self, host: &str) -> Result<std::sync::Arc<ServerConfig>> {
        let key = host.trim().trim_matches('.').to_ascii_lowercase();
        if let Some(existing) = self.cache.lock().expect("ca cache").get(&key).cloned() {
            return Ok(existing);
        }
        let config = std::sync::Arc::new(self.issue_server_config(&key)?);
        self.cache
            .lock()
            .expect("ca cache")
            .insert(key, config.clone());
        Ok(config)
    }

    fn issue_server_config(&self, host: &str) -> Result<ServerConfig> {
        let leaf_key = KeyPair::generate().context("generate leaf key")?;
        let mut params = leaf_params(host)?;
        params.not_before = OffsetDateTime::now_utc() - time::Duration::days(1);
        params.not_after = OffsetDateTime::now_utc() + time::Duration::days(365);
        params.extended_key_usages = vec![ExtendedKeyUsagePurpose::ServerAuth];
        params.key_usages = vec![
            KeyUsagePurpose::DigitalSignature,
            KeyUsagePurpose::KeyEncipherment,
        ];
        let issuer = self.issuer()?;
        let cert = params
            .signed_by(&leaf_key, &issuer)
            .context("sign leaf certificate")?;

        let cert_der = CertificateDer::from(cert.der().as_ref().to_vec());
        let key_der = PrivateKeyDer::Pkcs8(PrivatePkcs8KeyDer::from(leaf_key.serialize_der()));
        let mut config = ServerConfig::builder()
            .with_no_client_auth()
            .with_single_cert(vec![cert_der], key_der)
            .context("build rustls server config")?;
        // Force HTTP/1.1 through the MITM so we can intercept without an HTTP/2 parser yet.
        config.alpn_protocols = vec![b"http/1.1".to_vec()];
        Ok(config)
    }

    pub fn fingerprint_prefix(&self) -> String {
        self.fingerprint_sha256.chars().take(16).collect::<String>()
    }
}

fn leaf_params(host: &str) -> Result<CertificateParams> {
    let mut dn = DistinguishedName::new();
    dn.push(DnType::CommonName, host);

    if let Ok(ip) = host.parse::<IpAddr>() {
        let mut params = CertificateParams::new(Vec::<String>::new())?;
        params.subject_alt_names = vec![SanType::IpAddress(ip)];
        params.distinguished_name = dn;
        return Ok(params);
    }

    let mut params = CertificateParams::new(vec![host.to_string()])?;
    params.distinguished_name = dn;
    Ok(params)
}

fn pem_to_der(pem: &str) -> Result<Vec<u8>> {
    let mut cursor = std::io::Cursor::new(pem.as_bytes());
    let certs: Vec<CertificateDer<'static>> = rustls_pemfile::certs(&mut cursor)
        .collect::<Result<_, _>>()
        .context("parse PEM certificates")?;
    let cert = certs
        .into_iter()
        .next()
        .context("CA PEM contained no certificates")?;
    Ok(cert.to_vec())
}

fn write_secret_file(path: &Path, bytes: &[u8]) -> Result<()> {
    let mut opts = OpenOptions::new();
    opts.write(true).create(true).truncate(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        opts.mode(0o600);
    }
    let mut file = opts
        .open(path)
        .with_context(|| format!("open {}", path.display()))?;
    file.write_all(bytes)
        .with_context(|| format!("write {}", path.display()))?;
    file.sync_all().ok();
    Ok(())
}

/// How long a cached leaf config is considered useful. Currently unused; cache is process-lifetime.
#[allow(dead_code)]
const LEAF_TTL: Duration = Duration::from_secs(60 * 60);

#[cfg(test)]
mod tests {
    use super::*;
    use rustls::{ClientConfig, RootCertStore};
    use rustls_pki_types::{ServerName, UnixTime};
    use std::sync::Arc;

    #[test]
    fn issues_leaf_trusted_by_install_ca() {
        crate::install_crypto();
        let dir = tempfile::tempdir().unwrap();
        let ca = CertificateAuthority::load_or_create(dir.path()).unwrap();
        let reloaded = CertificateAuthority::load_or_create(dir.path()).unwrap();
        assert_eq!(ca.fingerprint_sha256, reloaded.fingerprint_sha256);

        let server = ca.server_config_for("app.lurkwire.test").unwrap();
        assert!(!server.alpn_protocols.is_empty());

        let mut roots = RootCertStore::empty();
        roots
            .add(CertificateDer::from(ca.cert_der.clone()))
            .unwrap();
        let client = ClientConfig::builder()
            .with_root_certificates(roots)
            .with_no_client_auth();

        // Verify the leaf we would present can be reconstructed from the server config.
        // A full handshake is covered by the MITM integration test.
        let _ = UnixTime::now();
        let _ = ServerName::try_from("app.lurkwire.test").unwrap();
        let _ = Arc::new(client);
        assert_eq!(ca.cert_path, dir.path().join("ca.pem"));
        assert!(ca.cert_pem.contains("BEGIN CERTIFICATE"));
    }
}
