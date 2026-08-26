import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/index.css';
import RichTextEditor from '../src/components/RichTextEditor';
import RichText from '../src/components/RichText';

function Harness() {
  const [value, setValue] = useState('**Бриф** готовий\n- перший пункт\n- другий пункт');
  return (
    <div style={{ padding: 24, maxWidth: 720, fontFamily: 'system-ui' }}>
      <RichTextEditor value={value} onChange={setValue} placeholder="Додати детальніший опис..." autoFocus />
      <h3 style={{ marginTop: 24 }}>markdown у базі</h3>
      <pre id="markdown-out" style={{ background: '#f3f4f6', padding: 12, borderRadius: 8, fontSize: 12 }}>{value}</pre>
      <h3>як виглядає в режимі перегляду</h3>
      <div id="view-out" style={{ background: '#f9fafb', padding: 12, borderRadius: 8, fontSize: 14 }}>
        <RichText text={value} />
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Harness />);
