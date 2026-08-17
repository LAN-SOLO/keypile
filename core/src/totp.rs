//! RFC 6238 TOTP. Accepts either a raw base32 secret ("JBSWY3DPEHPK3PXP")
//! or a full otpauth:// URI (as scanned from QR codes).

use hmac::{Hmac, Mac};
use sha1::Sha1;
use sha2::{Sha256, Sha512};

use crate::error::{CoreError, Result};

#[derive(Debug, Clone, PartialEq)]
pub struct TotpConfig {
    pub secret: Vec<u8>,
    pub digits: u32,
    pub period: u64,
    pub algorithm: Algo,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Algo {
    Sha1,
    Sha256,
    Sha512,
}

fn decode_base32(s: &str) -> Result<Vec<u8>> {
    let cleaned: String = s
        .chars()
        .filter(|c| !c.is_whitespace() && *c != '-')
        .collect::<String>()
        .to_uppercase();
    let cleaned = cleaned.trim_end_matches('=');
    base32::decode(base32::Alphabet::Rfc4648 { padding: false }, cleaned)
        .ok_or_else(|| CoreError::Totp("not valid base32".into()))
}

/// Parse either a raw base32 secret or an otpauth:// URI.
pub fn parse(input: &str) -> Result<TotpConfig> {
    let input = input.trim();
    if input.starts_with("otpauth://") {
        parse_otpauth(input)
    } else {
        Ok(TotpConfig {
            secret: decode_base32(input)?,
            digits: 6,
            period: 30,
            algorithm: Algo::Sha1,
        })
    }
}

fn parse_otpauth(uri: &str) -> Result<TotpConfig> {
    let query = uri
        .splitn(2, '?')
        .nth(1)
        .ok_or_else(|| CoreError::Totp("otpauth URI has no query string".into()))?;
    let mut secret = None;
    let mut digits = 6u32;
    let mut period = 30u64;
    let mut algorithm = Algo::Sha1;
    for pair in query.split('&') {
        let mut kv = pair.splitn(2, '=');
        let k = kv.next().unwrap_or("").to_lowercase();
        let v = kv.next().unwrap_or("");
        match k.as_str() {
            "secret" => secret = Some(decode_base32(v)?),
            "digits" => {
                digits = v
                    .parse()
                    .map_err(|_| CoreError::Totp("bad digits".into()))?
            }
            "period" => {
                period = v
                    .parse()
                    .map_err(|_| CoreError::Totp("bad period".into()))?
            }
            "algorithm" => {
                algorithm = match v.to_uppercase().as_str() {
                    "SHA1" => Algo::Sha1,
                    "SHA256" => Algo::Sha256,
                    "SHA512" => Algo::Sha512,
                    other => return Err(CoreError::Totp(format!("unknown algorithm {other}"))),
                }
            }
            _ => {}
        }
    }
    let secret = secret.ok_or_else(|| CoreError::Totp("otpauth URI missing secret".into()))?;
    if !(4..=10).contains(&digits) || period == 0 {
        return Err(CoreError::Totp("implausible digits/period".into()));
    }
    Ok(TotpConfig {
        secret,
        digits,
        period,
        algorithm,
    })
}

fn hotp(config: &TotpConfig, counter: u64) -> u32 {
    let msg = counter.to_be_bytes();
    let digest: Vec<u8> = match config.algorithm {
        Algo::Sha1 => {
            let mut mac = <Hmac<Sha1> as Mac>::new_from_slice(&config.secret).expect("hmac key");
            mac.update(&msg);
            mac.finalize().into_bytes().to_vec()
        }
        Algo::Sha256 => {
            let mut mac = <Hmac<Sha256> as Mac>::new_from_slice(&config.secret).expect("hmac key");
            mac.update(&msg);
            mac.finalize().into_bytes().to_vec()
        }
        Algo::Sha512 => {
            let mut mac = <Hmac<Sha512> as Mac>::new_from_slice(&config.secret).expect("hmac key");
            mac.update(&msg);
            mac.finalize().into_bytes().to_vec()
        }
    };
    let offset = (digest[digest.len() - 1] & 0x0f) as usize;
    let bin = ((digest[offset] as u32 & 0x7f) << 24)
        | ((digest[offset + 1] as u32) << 16)
        | ((digest[offset + 2] as u32) << 8)
        | (digest[offset + 3] as u32);
    bin % 10u32.pow(config.digits)
}

/// Current code + seconds until it rotates, for the given unix timestamp.
pub fn code_at(config: &TotpConfig, unix_time: u64) -> (String, u64) {
    let counter = unix_time / config.period;
    let code = hotp(config, counter);
    let remaining = config.period - (unix_time % config.period);
    (
        format!("{:0width$}", code, width = config.digits as usize),
        remaining,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    /// RFC 6238 Appendix B test vectors (SHA-1, secret "12345678901234567890", 8 digits).
    #[test]
    fn rfc6238_sha1_vectors() {
        let config = TotpConfig {
            secret: b"12345678901234567890".to_vec(),
            digits: 8,
            period: 30,
            algorithm: Algo::Sha1,
        };
        for (t, expected) in [
            (59u64, "94287082"),
            (1111111109, "07081804"),
            (1234567890, "89005924"),
            (2000000000, "69279037"),
        ] {
            assert_eq!(code_at(&config, t).0, expected, "t={t}");
        }
    }

    #[test]
    fn parses_raw_base32() {
        let c = parse("JBSWY3DPEHPK3PXP").unwrap();
        assert_eq!(c.secret, b"Hello!\xde\xad\xbe\xef");
        assert_eq!(c.digits, 6);
    }

    #[test]
    fn parses_otpauth_uri() {
        let c = parse(
            "otpauth://totp/Example:alice@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Example&digits=8&period=60&algorithm=SHA256",
        )
        .unwrap();
        assert_eq!(c.digits, 8);
        assert_eq!(c.period, 60);
        assert_eq!(c.algorithm, Algo::Sha256);
    }

    #[test]
    fn rejects_garbage() {
        assert!(parse("not base32 !!!").is_err());
        assert!(parse("otpauth://totp/x?digits=6").is_err());
    }
}
