//! Have-I-Been-Pwned range API with k-anonymity: only the first 5 hex chars
//! of the SHA-1 leave the device — never the password or its full hash.

use sha1::{Digest, Sha1};
use std::collections::HashMap;

fn sha1_hex_upper(password: &str) -> String {
    let digest = Sha1::digest(password.as_bytes());
    digest.iter().map(|b| format!("{b:02X}")).collect()
}

/// Check many passwords with as few requests as possible (grouped by prefix).
/// Returns password → breach count (only entries with count > 0).
pub async fn check_passwords(passwords: &[String]) -> Result<HashMap<String, u64>, String> {
    // prefix → [(suffix, original password)]
    let mut by_prefix: HashMap<String, Vec<(String, String)>> = HashMap::new();
    for pw in passwords {
        if pw.is_empty() {
            continue;
        }
        let hash = sha1_hex_upper(pw);
        let (prefix, suffix) = hash.split_at(5);
        by_prefix
            .entry(prefix.to_string())
            .or_default()
            .push((suffix.to_string(), pw.clone()));
    }

    let client = reqwest::Client::builder()
        .user_agent("keypile/0.1 (+https://lan-solo.com/tools/keypile)")
        .build()
        .map_err(|e| e.to_string())?;

    let mut results = HashMap::new();
    for (prefix, wanted) in by_prefix {
        let url = format!("https://api.pwnedpasswords.com/range/{prefix}");
        let resp = client
            .get(&url)
            .header("Add-Padding", "true")
            .send()
            .await
            .map_err(|e| format!("HIBP nicht erreichbar: {e}"))?;
        if !resp.status().is_success() {
            return Err(format!("HIBP-Fehler: HTTP {}", resp.status()));
        }
        let body = resp.text().await.map_err(|e| e.to_string())?;
        let counts: HashMap<&str, u64> = body
            .lines()
            .filter_map(|line| {
                let mut parts = line.trim().splitn(2, ':');
                let suffix = parts.next()?;
                let count: u64 = parts.next()?.trim().parse().ok()?;
                Some((suffix, count))
            })
            .collect();
        for (suffix, pw) in wanted {
            if let Some(&count) = counts.get(suffix.as_str()) {
                if count > 0 {
                    results.insert(pw, count);
                }
            }
        }
    }
    Ok(results)
}
