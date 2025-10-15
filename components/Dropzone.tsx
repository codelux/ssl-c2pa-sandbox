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
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
          active ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
        }`}
      >
        <div className="flex flex-col items-center gap-2">
          <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          <p className="text-base font-medium text-gray-700">Click to select an image</p>
          <p className="text-sm text-gray-500">or drag and drop</p>
          <p className="text-xs text-gray-400 mt-1">JPEG, PNG, WebP • Max 10MB</p>
        </div>
      </div>
      <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={onChange} />
    </div>
  );
}
