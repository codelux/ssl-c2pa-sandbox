"use client";
import { useCallback, useRef, useState } from 'react';

export function Dropzone({
  onFile,
  accept = 'image/jpeg,image/png,image/webp',
  maxBytes = 10 * 1024 * 1024,
}: {
  onFile: (file: File) => void;
  accept?: string;
  maxBytes?: number;
}) {
  const [active, setActive] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setActive(false);
      const f = e.dataTransfer.files?.[0];
      if (f) {
        if (f.size > maxBytes) return alert('File too large');
        onFile(f);
      }
    },
    [onFile, maxBytes]
  );

  const onChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      if (f.size > maxBytes) return alert('File too large');
      onFile(f);
    }
  }, [onFile, maxBytes]);

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload image"
        onKeyDown={(e) => { if (e.key === 'Enter') inputRef.current?.click(); }}
        onDragOver={(e) => { e.preventDefault(); setActive(true); }}
        onDragLeave={() => setActive(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded p-6 text-center cursor-pointer ${active ? 'border-blue-400 bg-blue-50' : 'border-gray-300'}`}
      >
        <p className="text-sm text-gray-600">Drag-and-drop an image, or click to select.</p>
        <p className="text-xs text-gray-500 mt-1">Accepted: JPEG, PNG, WebP</p>
      </div>
      <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={onChange} />
    </div>
  );
}
