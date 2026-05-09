import React, { useState, useRef, useEffect } from 'react';

function keydownToAccelerator(e) {
  const k = e.key;
  if (k === 'Control' || k === 'Shift' || k === 'Alt' || k === 'Meta' || k === 'OS') {
    return null;
  }

  const mods = [];
  if (e.ctrlKey || e.metaKey) mods.push('CommandOrControl');
  if (e.shiftKey) mods.push('Shift');
  if (e.altKey) mods.push('Alt');

  let mainKey;
  if (k === ' ') mainKey = 'Space';
  else if (k === 'ArrowUp') mainKey = 'Up';
  else if (k === 'ArrowDown') mainKey = 'Down';
  else if (k === 'ArrowLeft') mainKey = 'Left';
  else if (k === 'ArrowRight') mainKey = 'Right';
  else if (k === 'Enter') mainKey = 'Return';
  else if (k === 'Tab') mainKey = 'Tab';
  else if (k === 'Backspace') mainKey = 'Backspace';
  else if (k === 'Delete') mainKey = 'Delete';
  else if (k.length === 1) mainKey = k.toUpperCase();
  else mainKey = k;

  return { mods, mainKey };
}

const styles = {
  root: { display: 'flex', alignItems: 'center', gap: 8 },
  chip: {
    backgroundColor: '#1f2937',
    border: '1px solid #374151',
    borderRadius: 4,
    padding: '4px 10px',
    fontFamily: 'monospace',
    fontSize: 13,
    color: '#e5e7eb',
    minWidth: 200,
    textAlign: 'center',
  },
  chipRecording: {
    backgroundColor: '#1e3a8a',
    border: '1px solid #3b82f6',
    borderRadius: 4,
    padding: '4px 10px',
    fontFamily: 'monospace',
    fontSize: 13,
    color: '#dbeafe',
    minWidth: 200,
    textAlign: 'center',
    outline: 'none',
  },
  btn: {
    padding: '4px 10px',
    fontSize: 12,
    borderRadius: 4,
    border: 'none',
    cursor: 'pointer',
    backgroundColor: '#374151',
    color: '#f9fafb',
  },
};

export default function ShortcutInput({ value, onChange, onError }) {
  const [recording, setRecording] = useState(false);
  const captureRef = useRef(null);

  useEffect(() => {
    if (recording && captureRef.current) {
      captureRef.current.focus();
    }
  }, [recording]);

  function handleKeyDown(e) {
    e.preventDefault();
    e.stopPropagation();

    if (e.key === 'Escape') {
      setRecording(false);
      return;
    }

    const result = keydownToAccelerator(e);
    if (!result) return;

    if (result.mods.length === 0) {
      if (typeof onError === 'function') onError('Au moins un modifier (Ctrl/Shift/Alt) est requis.');
      return;
    }

    const accelerator = [...result.mods, result.mainKey].join('+');
    if (typeof onChange === 'function') onChange(accelerator);
    setRecording(false);
  }

  return (
    <div style={styles.root}>
      {recording ? (
        <div
          ref={captureRef}
          tabIndex={0}
          data-testid="shortcut-capture"
          style={styles.chipRecording}
          onKeyDown={handleKeyDown}
        >
          Appuie sur la combinaison…
        </div>
      ) : (
        <code style={styles.chip}>{value}</code>
      )}
      {!recording && (
        <button style={styles.btn} onClick={() => setRecording(true)}>
          Modifier
        </button>
      )}
    </div>
  );
}
