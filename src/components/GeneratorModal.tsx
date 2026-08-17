import { useCallback, useEffect, useState } from 'react';
import { api, PassphraseOptions, PasswordOptions } from '../api';
import { useApp } from '../App';
import StrengthMeter from './StrengthMeter';

interface Props {
  onClose: () => void;
  onPick?: (password: string) => void;
}

export default function GeneratorModal({ onClose, onPick }: Props) {
  const { t, toast } = useApp();
  const [tab, setTab] = useState<'password' | 'passphrase'>('password');
  const [pwOpts, setPwOpts] = useState<PasswordOptions>({
    length: 20,
    lower: true,
    upper: true,
    digits: true,
    symbols: true,
    avoid_ambiguous: false,
  });
  const [ppOpts, setPpOpts] = useState<PassphraseOptions>({
    words: 5,
    separator: '-',
    capitalize: false,
    include_digit: false,
  });
  const [output, setOutput] = useState('');

  const regenerate = useCallback(async () => {
    const value =
      tab === 'password'
        ? await api.generatePassword(pwOpts)
        : await api.generatePassphrase(ppOpts);
    setOutput(value);
  }, [tab, pwOpts, ppOpts]);

  useEffect(() => {
    regenerate();
  }, [regenerate]);

  const copy = async () => {
    await api.copySecret(output);
    toast(t.copied);
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="mhead">
          <h3>{t.generator}</h3>
          <button className="ghost icon" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="mbody">
          <div className="tabs">
            <button className={tab === 'password' ? 'active' : ''} onClick={() => setTab('password')}>
              {t.passwordTab}
            </button>
            <button
              className={tab === 'passphrase' ? 'active' : ''}
              onClick={() => setTab('passphrase')}
            >
              {t.passphraseTab}
            </button>
          </div>

          <div className="gen-output">
            <span className="pw">{output}</span>
            <button className="icon noflex" onClick={regenerate} title={t.regenerate}>
              ↻
            </button>
            <button className="icon noflex" onClick={copy}>
              {t.copy}
            </button>
          </div>
          <StrengthMeter password={output} />

          {tab === 'password' ? (
            <div style={{ marginTop: 16 }}>
              <label className="field">
                <span>
                  {t.length}: {pwOpts.length}
                </span>
                <input
                  type="range"
                  min={8}
                  max={64}
                  value={pwOpts.length}
                  onChange={(e) => setPwOpts({ ...pwOpts, length: Number(e.target.value) })}
                />
              </label>
              {(
                [
                  ['lower', t.lowercase],
                  ['upper', t.uppercase],
                  ['digits', t.digits],
                  ['symbols', t.symbols],
                  ['avoid_ambiguous', t.avoidAmbiguous],
                ] as const
              ).map(([key, label]) => (
                <label className="check" key={key}>
                  <input
                    type="checkbox"
                    checked={pwOpts[key]}
                    onChange={(e) => setPwOpts({ ...pwOpts, [key]: e.target.checked })}
                  />
                  {label}
                </label>
              ))}
            </div>
          ) : (
            <div style={{ marginTop: 16 }}>
              <label className="field">
                <span>
                  {t.words}: {ppOpts.words}
                </span>
                <input
                  type="range"
                  min={3}
                  max={10}
                  value={ppOpts.words}
                  onChange={(e) => setPpOpts({ ...ppOpts, words: Number(e.target.value) })}
                />
              </label>
              <label className="field" style={{ maxWidth: 120 }}>
                <span>{t.separator}</span>
                <input
                  type="text"
                  value={ppOpts.separator}
                  maxLength={3}
                  onChange={(e) => setPpOpts({ ...ppOpts, separator: e.target.value })}
                />
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={ppOpts.capitalize}
                  onChange={(e) => setPpOpts({ ...ppOpts, capitalize: e.target.checked })}
                />
                {t.capitalize}
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={ppOpts.include_digit}
                  onChange={(e) => setPpOpts({ ...ppOpts, include_digit: e.target.checked })}
                />
                {t.includeDigit}
              </label>
            </div>
          )}
        </div>
        {onPick && (
          <div className="mfoot">
            <button onClick={onClose}>{t.cancel}</button>
            <button className="primary" onClick={() => onPick(output)}>
              {t.useThis}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
