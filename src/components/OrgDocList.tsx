import React, { useRef, useState } from 'react';
import { Check, ExternalLink, FileText, Link2, Loader2, Pencil, Plus, Trash2, Upload, X } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { useAppContext } from '../App';
import { fetchLinkTitle, uploadFile } from '../api';
import type { OrgDoc } from '../types';

interface Props {
  title: string;
  hint: string;
  docs: OrgDoc[];
  onChange: (next: OrgDoc[]) => void;
  canEdit: boolean;
  accent: string;
}

/** Додає https://, якщо схему не вказано; null — це не схоже на адресу */
function normalizeUrl(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  const withScheme = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  try {
    const u = new URL(withScheme);
    return u.hostname.includes('.') ? u.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Список документів однієї категорії посади (регламенти або інструкції):
 * завантажити файл, додати посилання, перейменувати, видалити. Кожна дія
 * зберігається одразу — окремої кнопки «Зберегти» немає.
 */
export default function OrgDocList({ title, hint, docs, onChange, canEdit, accent }: Props) {
  const { confirmAction } = useAppContext();
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isAddingLink, setIsAddingLink] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkName, setLinkName] = useState('');
  const [linkBusy, setLinkBusy] = useState(false);

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const handleUpload = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    setError(null);
    setUploading(true);
    const added: OrgDoc[] = [];
    const failed: string[] = [];
    for (const f of Array.from(list)) {
      try {
        const att = await uploadFile(f);
        added.push({ id: uuidv4(), name: att.name || f.name, url: att.url, kind: 'file' });
      } catch {
        failed.push(f.name);
      }
    }
    setUploading(false);
    if (fileInput.current) fileInput.current.value = '';
    if (added.length) onChange([...docs, ...added]);
    if (failed.length) setError(`Не вдалося завантажити: ${failed.join(', ')}`);
  };

  const handleAddLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const url = normalizeUrl(linkUrl);
    if (!url) { setError('Вкажіть коректне посилання, наприклад https://docs.google.com/…'); return; }
    setLinkBusy(true);
    let name = linkName.trim();
    if (!name) {
      try { name = (await fetchLinkTitle(url)) || ''; } catch { /* лишаємо порожнім */ }
      if (!name) name = new URL(url).hostname.replace(/^www\./, '');
    }
    setLinkBusy(false);
    onChange([...docs, { id: uuidv4(), name, url, kind: 'link' }]);
    setLinkUrl('');
    setLinkName('');
    setIsAddingLink(false);
  };

  const commitRename = () => {
    const id = renamingId;
    const name = renameValue.trim();
    setRenamingId(null);
    if (!id || !name) return;
    if (docs.find(d => d.id === id)?.name === name) return;
    onChange(docs.map(d => (d.id === id ? { ...d, name } : d)));
  };

  return (
    <section>
      <div className="flex items-baseline justify-between mb-2">
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{title}</h4>
        <span className="text-xs text-gray-400 tabular-nums">{docs.length}</span>
      </div>

      {docs.length === 0 ? (
        <p className="text-sm text-gray-400 mb-2">{canEdit ? hint : 'Нічого не прикріплено.'}</p>
      ) : (
        <ul className="space-y-1.5 mb-2">
          {docs.map(doc => {
            const isLink = doc.kind === 'link';
            const Icon = isLink ? Link2 : FileText;
            if (renamingId === doc.id) {
              return (
                <li key={doc.id}>
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={e => setRenameValue(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={e => {
                      if (e.key === 'Enter') commitRename();
                      if (e.key === 'Escape') setRenamingId(null);
                    }}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-blue-400 bg-white outline-none focus:ring-2 focus:ring-blue-500/30"
                  />
                </li>
              );
            }
            return (
              <li
                key={doc.id}
                className="group flex items-center rounded-lg border border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm transition"
              >
                <a
                  href={doc.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={isLink ? 'Відкрити посилання' : 'Відкрити файл'}
                  className="flex items-center gap-2 flex-1 min-w-0 pl-3 pr-2 py-2 text-sm font-medium text-gray-700 hover:text-gray-900"
                >
                  <Icon className="w-4 h-4 shrink-0" style={{ color: accent }} />
                  <span className="truncate">{doc.name}</span>
                  <ExternalLink className="w-3 h-3 shrink-0 text-gray-300 group-hover:text-gray-500" />
                </a>
                {canEdit && (
                  <span className="flex items-center pr-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition">
                    <button
                      type="button"
                      onClick={() => { setRenameValue(doc.name); setRenamingId(doc.id); }}
                      title="Перейменувати"
                      className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-600"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => confirmAction(`Видалити «${doc.name}»?`, () => onChange(docs.filter(d => d.id !== doc.id)))}
                      title="Видалити"
                      className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-red-600"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {canEdit && (
        isAddingLink ? (
          <form onSubmit={handleAddLink} className="space-y-2">
            <input
              autoFocus
              value={linkUrl}
              onChange={e => setLinkUrl(e.target.value)}
              placeholder="https://docs.google.com/…"
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 bg-white outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              value={linkName}
              onChange={e => setLinkName(e.target.value)}
              placeholder="Назва (необов'язково)"
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 bg-white outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={linkBusy}
                className="px-3 py-1.5 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 flex items-center gap-1.5"
              >
                {linkBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                Додати
              </button>
              <button
                type="button"
                onClick={() => { setIsAddingLink(false); setError(null); }}
                className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-lg"
                title="Скасувати"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </form>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              disabled={uploading}
              className="px-3 py-1.5 text-sm font-medium rounded-lg bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 disabled:opacity-60 flex items-center gap-1.5"
            >
              {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              {uploading ? 'Завантаження…' : 'Файл'}
            </button>
            <button
              type="button"
              onClick={() => { setIsAddingLink(true); setError(null); }}
              className="px-3 py-1.5 text-sm font-medium rounded-lg bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              Посилання
            </button>
            <input ref={fileInput} type="file" multiple className="hidden" onChange={e => handleUpload(e.target.files)} />
          </div>
        )
      )}
      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
    </section>
  );
}
