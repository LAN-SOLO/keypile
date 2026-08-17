//! Password strength estimation (zxcvbn) — used for the master password
//! meter and the vault-wide health check.

use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct Strength {
    /// 0 (trivial) … 4 (strong)
    pub score: u8,
    /// log10 of estimated guesses
    pub guesses_log10: f64,
    pub warning: Option<String>,
    pub suggestions: Vec<String>,
}

pub fn estimate(password: &str, user_inputs: &[&str]) -> Strength {
    if password.is_empty() {
        return Strength {
            score: 0,
            guesses_log10: 0.0,
            warning: None,
            suggestions: vec![],
        };
    }
    let e = zxcvbn::zxcvbn(password, user_inputs);
    let feedback = e.feedback();
    Strength {
        score: e.score() as u8,
        guesses_log10: e.guesses_log10(),
        warning: feedback
            .and_then(|f| f.warning())
            .map(|w| w.to_string()),
        suggestions: feedback
            .map(|f| f.suggestions().iter().map(|s| s.to_string()).collect())
            .unwrap_or_default(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn weak_vs_strong() {
        assert!(estimate("password", &[]).score <= 1);
        assert!(estimate("correct-horse-battery-staple-9x!", &[]).score >= 3);
    }
}
