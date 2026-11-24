import React, { useRef, useState } from 'react';
import { Check, ExternalLink, Link2, Loader2, Paperclip, Pencil, Plus, Trash2, Upload, X } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { useAppContext } from '../App';
import { fetchLinkTitle, uploadFile } from '../api';
import type { Project, ProjectInfoFile } from '../types';

interface Props {
  project: Project;
  /** Чи може людина змінювати список (право редагування + керує проєктом) */
  canEdit: boolean;
}

/** Додає https://, якщо схему не вказано; повертає null, якщо це не схоже на адресу */
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
 * Інфо-файли проєкту просто в банері «Інфо про проєкт»: завантажити файл,
 * додати посилання, перейменувати, видалити. Кожна дія зберігається одразу —
 * відкривати форму проєкту й тиснути «Зберегти» не потрібно.
 */
export default function ProjectInfoFiles({ project, canEdit }: Props) {
  const { updateProject, confirmAction } = useAppContext();
  const files = project.infoFiles || [];
  const accent = project.color;

  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isAddingLink, setIsAddingLink] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkName, setLinkName] = useState('');
  const [linkBusy, setLinkBusy] = useState(false);

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const save = (next: ProjectInfoFile[]) => updateProject(project.id, { infoFiles: next });

  const handleUpload = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    setError(null);
    setUploading(true);
    const added: ProjectInfoFile[] = [];
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
    if (added.length) save([...files, ...added]);
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
      // Назву беремо з самого документа; якщо не вийшло — з адреси
      try { name = (await fetchLinkTitle(url)) || ''; } catch { /* лишаємо порожнім */ }
      if (!name) name = new URL(url).hostname.replace(/^www\./, '');
    }
    setLinkBusy(false);
    save([...files, { id: uuidv4(), name, url, kind: 'link' }]);
    setLinkUrl('');
    setLinkName('');
    setIsAddingLink(false);
  };

  const commitRename = () => {
    const id = renamingId;
    const name = renameValue.trim();
    setRenamingId(null);
    if (!id || !name) return;
    if (files.find(f => f.id === id)?.name === name) return;
    save(files.map(f => (f.id === id ? { ...f, name } : f)));
  };

  if (!canEdit && files.length === 0) return null;

  return (
    <div className="flex items-start gap-2">
      <Paperclip className="w-4 h-4 mt-0.5 shrink-0" style={{ color: accent }} />
      <div className="min-w-0 flex-1">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Інфо-файли</div>

        {files.length === 0 && (
          <p className="text-sm text-gray-400 mb-2">Поки що немає файлів. Додайте бриф, договір чи посилання на документ.</p>
        )}

        <div className="flex flex-wrap gap-2">
          {files.map(file => {
            const isLink = file.kind ? file.kind === 'link' : /^https?:\/\//i.test(file.url) && !file.url.includes('/uploads/');
            const Icon = isLink ? Link2 : Paperclip;
            if (renamingId === file.id) {
              return (
                <input
                  key={file.id}
                  autoFocus
                  value={renameValue}
                  onChange={e => setRenameValue(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={e => {
                    if (e.key === 'Enter') commitRename();
                    if (e.key === 'Escape') setRenamingId(null);
                  }}
                  className="px-3 py-1.5 text-sm rounded-lg border border-blue-400 bg-white outline-none focus:ring-2 focus:ring-blue-500/30 w-56"
                />
              );
            }
            return (
              <div
                key={file.id}
                className="group inline-flex items-center rounded-lg border transition hover:shadow-sm"
                style={{ color: accent, borderColor: accent + '40', backgroundColor: accent + '08' }}
              >
                <a
                  href={file.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={isLink ? 'Відкрити посилання' : 'Відкрити файл'}
                  className="inline-flex items-center gap-1.5 pl-3 pr-2 py-1.5 text-sm font-medium max-w-[280px]"
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{file.name}</span>
                  {isLink && <ExternalLink className="w-3 h-3 shrink-0 opacity-60" />}
                </a>
                {canEdit && (
                  <span className="inline-flex items-center pr-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition">
                    <button
                      type="button"
                      onClick={() => { setRenameValue(file.name); setRenamingId(file.id); }}
                      title="Перейменувати"
                      className="p-1 rounded hover:bg-white/70 text-gray-500 hover:text-blue-600"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => confirmAction(`Видалити «${file.name}» з інфо проєкту?`, () => save(files.filter(f => f.id !== file.id)))}
                      title="Видалити"
                      className="p-1 rounded hover:bg-white/70 text-gray-500 hover:text-red-600"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {canEdit && (
          <div className="mt-2">
            {isAddingLink ? (
              <form onSubmit={handleAddLink} className="flex flex-wrap items-center gap-2">
                <input
                  autoFocus
                  value={linkUrl}
                  onChange={e => setLinkUrl(e.target.value)}
                  placeholder="https://docs.google.com/…"
                  className="flex-[2] min-w-[200px] px-3 py-1.5 text-sm rounded-lg border border-gray-300 bg-white outline-none focus:ring-2 focus:ring-blue-500"
                />
                <input
                  value={linkName}
                  onChange={e => setLinkName(e.target.value)}
                  placeholder="Назва (необов'язково)"
                  className="flex-1 min-w-[140px] px-3 py-1.5 text-sm rounded-lg border border-gray-300 bg-white outline-none focus:ring-2 focus:ring-blue-500"
                />
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
                  className="p-1.5 text-gray-500 hover:bg-white/70 rounded-lg"
                  title="Скасувати"
                >
                  <X className="w-4 h-4" />
                </button>
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
                  {uploading ? 'Завантаження…' : 'Завантажити файл'}
                </button>
                <button
                  type="button"
                  onClick={() => { setIsAddingLink(true); setError(null); }}
                  className="px-3 py-1.5 text-sm font-medium rounded-lg bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Додати посилання
                </button>
                <input
                  ref={fileInput}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={e => handleUpload(e.target.files)}
                />
              </div>
            )}
            {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
