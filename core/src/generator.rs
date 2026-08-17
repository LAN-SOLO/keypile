//! Password and passphrase generation using the OS CSPRNG.

use rand::seq::SliceRandom;
use rand::Rng;
use serde::{Deserialize, Serialize};

const LOWER: &str = "abcdefghijklmnopqrstuvwxyz";
const UPPER: &str = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const DIGITS: &str = "0123456789";
const SYMBOLS: &str = "!@#$%^&*_-+=?";
/// Characters easily confused with each other (excluded when `avoid_ambiguous`).
const AMBIGUOUS: &str = "Il1O0o5S";

/// EFF large word list: 7776 words, 12.9 bits of entropy per word.
static WORDLIST: &str = include_str!("../assets/eff_large_wordlist.txt");

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PasswordOptions {
    pub length: usize,
    pub lower: bool,
    pub upper: bool,
    pub digits: bool,
    pub symbols: bool,
    pub avoid_ambiguous: bool,
}

impl Default for PasswordOptions {
    fn default() -> Self {
        PasswordOptions {
            length: 20,
            lower: true,
            upper: true,
            digits: true,
            symbols: true,
            avoid_ambiguous: false,
        }
    }
}

pub fn generate_password(opts: &PasswordOptions) -> String {
    let mut classes: Vec<Vec<char>> = Vec::new();
    let filter = |set: &str| -> Vec<char> {
        set.chars()
            .filter(|c| !opts.avoid_ambiguous || !AMBIGUOUS.contains(*c))
            .collect()
    };
    if opts.lower {
        classes.push(filter(LOWER));
    }
    if opts.upper {
        classes.push(filter(UPPER));
    }
    if opts.digits {
        classes.push(filter(DIGITS));
    }
    if opts.symbols {
        classes.push(filter(SYMBOLS));
    }
    if classes.is_empty() {
        classes.push(filter(LOWER));
    }
    let length = opts.length.clamp(classes.len().max(4), 256);

    let pool: Vec<char> = classes.iter().flatten().copied().collect();
    let mut rng = rand::rngs::OsRng;
    // Guarantee at least one char from every selected class, fill the rest
    // from the full pool, then shuffle so the guaranteed chars aren't leading.
    let mut chars: Vec<char> = classes
        .iter()
        .map(|c| c[rng.gen_range(0..c.len())])
        .collect();
    while chars.len() < length {
        chars.push(pool[rng.gen_range(0..pool.len())]);
    }
    chars.shuffle(&mut rng);
    chars.into_iter().collect()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PassphraseOptions {
    pub words: usize,
    pub separator: String,
    pub capitalize: bool,
    pub include_digit: bool,
}

impl Default for PassphraseOptions {
    fn default() -> Self {
        PassphraseOptions {
            words: 5,
            separator: "-".into(),
            capitalize: false,
            include_digit: false,
        }
    }
}

pub fn generate_passphrase(opts: &PassphraseOptions) -> String {
    let words: Vec<&str> = WORDLIST
        .lines()
        .filter_map(|l| l.split_whitespace().nth(1))
        .collect();
    debug_assert_eq!(words.len(), 7776);
    let mut rng = rand::rngs::OsRng;
    let count = opts.words.clamp(3, 12);
    let mut picked: Vec<String> = (0..count)
        .map(|_| {
            let w = words[rng.gen_range(0..words.len())];
            if opts.capitalize {
                let mut c = w.chars();
                match c.next() {
                    Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
                    None => String::new(),
                }
            } else {
                w.to_string()
            }
        })
        .collect();
    if opts.include_digit {
        let idx = rng.gen_range(0..picked.len());
        picked[idx].push_str(&rng.gen_range(0..10u8).to_string());
    }
    picked.join(&opts.separator)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn respects_length_and_classes() {
        let opts = PasswordOptions {
            length: 24,
            ..Default::default()
        };
        for _ in 0..50 {
            let pw = generate_password(&opts);
            assert_eq!(pw.len(), 24);
            assert!(pw.chars().any(|c| c.is_ascii_lowercase()));
            assert!(pw.chars().any(|c| c.is_ascii_uppercase()));
            assert!(pw.chars().any(|c| c.is_ascii_digit()));
            assert!(pw.chars().any(|c| SYMBOLS.contains(c)));
        }
    }

    #[test]
    fn ambiguous_excluded() {
        let opts = PasswordOptions {
            length: 200,
            avoid_ambiguous: true,
            ..Default::default()
        };
        let pw = generate_password(&opts);
        assert!(!pw.chars().any(|c| AMBIGUOUS.contains(c)));
    }

    #[test]
    fn passphrase_word_count() {
        let opts = PassphraseOptions::default();
        let pp = generate_passphrase(&opts);
        assert_eq!(pp.split('-').count(), 5);
    }

    #[test]
    fn wordlist_complete() {
        assert_eq!(
            WORDLIST
                .lines()
                .filter(|l| !l.trim().is_empty())
                .count(),
            7776
        );
    }
}
