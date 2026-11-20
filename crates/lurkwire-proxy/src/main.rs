//! Lurkwire intercepting proxy sidecar.
//!
//! Module 1 ships a versioned binary stub. The TLS MITM engine, CA, and
//! traffic store land in the following module.

fn main() {
    let version = env!("CARGO_PKG_VERSION");
    if std::env::args().any(|a| a == "--version" || a == "-V") {
        println!("lurkwire-proxy {version}");
        return;
    }
    println!("lurkwire-proxy {version}");
    println!("ready: stub (MITM engine not yet wired)");
}

#[cfg(test)]
mod tests {
    #[test]
    fn version_is_semver() {
        let version = env!("CARGO_PKG_VERSION");
        let parts: Vec<&str> = version.split('.').collect();
        assert!(parts.len() >= 3, "expected semver, got {version}");
        assert!(parts.iter().all(|p| p.chars().all(|c| c.is_ascii_digit())));
    }
}
