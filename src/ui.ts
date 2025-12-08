import yaml from 'js-yaml';

interface TextNode {
  id: string;
  text: string;
  layerName: string;
  suggestedKey: string;
}

interface Settings {
  token: string;
  repo: string;
  branch: string;
  translationsFolder: string;
  translationsFilename: string;
  languages: string;
}

let textNodes: TextNode[] = [];
let languages = ['en_US', 'de_DE', 'fr_FR'];
let settings: Settings = {
  token: '',
  repo: '',
  branch: 'main',
  translationsFolder: 'src',
  translationsFilename: 'translations.yaml',
  languages: 'en_US,de_DE,fr_FR'
};

// Store all existing translations from GitHub
// Structure: { key: { en_US: "value", de_DE: "value" } }
let existingKeys: Record<string, Record<string, string>> = {};
let keysLoaded = false;

// DOM helpers
function $(id: string): HTMLElement | null {
  return document.getElementById(id);
}

function setStatus(message: string, type = 'info') {
  const status = $('status');
  if (status) {
    status.textContent = message;
    status.className = 'status ' + type;
  }
}

let debugMessages: string[] = [];

function addDebug(message: string) {
  debugMessages.push(message);
  updateDebugPanel();
}

function updateDebugPanel() {
  const panel = $('debug-panel');
  if (!panel) return;

  // Add close button if not present
  if (!panel.querySelector('.panel-close')) {
    const closeBtn = document.createElement('button');
    closeBtn.className = 'panel-close';
    closeBtn.textContent = '×';
    closeBtn.onclick = () => {
      panel.classList.remove('visible');
      updateDebugToggleText();
    };
    panel.appendChild(closeBtn);
  }

  // Add/update content
  let content = panel.querySelector('.debug-content') as HTMLElement;
  if (!content) {
    content = document.createElement('div');
    content.className = 'debug-content';
    panel.appendChild(content);
  }
  content.textContent = debugMessages.join('\n');
  panel.scrollTop = panel.scrollHeight;

  // Update toggle text to show there's content
  updateDebugToggleText();
}

function updateDebugToggleText() {
  const toggleText = $('debug-toggle-text');
  const panel = $('debug-panel');
  if (!toggleText || !panel) return;

  const isVisible = panel.classList.contains('visible');
  const count = debugMessages.length;

  if (isVisible) {
    toggleText.textContent = 'Hide debug log';
  } else if (count > 0) {
    toggleText.textContent = `Show debug log (${count} messages)`;
  } else {
    toggleText.textContent = 'Show debug log';
  }
}

function toggleDebug() {
  const panel = $('debug-panel');
  if (panel) {
    panel.classList.toggle('visible');
    updateDebugToggleText();
  }
}

function clearDebug() {
  debugMessages = [];
  const panel = $('debug-panel');
  if (panel) {
    panel.innerHTML = '';
    panel.classList.remove('visible');
  }
  updateDebugToggleText();
}

// Apply settings to UI
function applySettingsToUI() {
  const tokenEl = $('github-token') as HTMLInputElement;
  const repoEl = $('github-repo') as HTMLInputElement;
  const branchEl = $('github-branch') as HTMLInputElement;
  const folderEl = $('translations-folder') as HTMLInputElement;
  const filenameEl = $('translations-filename') as HTMLInputElement;
  const languagesEl = $('languages') as HTMLInputElement;

  if (tokenEl) tokenEl.value = settings.token || '';
  if (repoEl) repoEl.value = settings.repo || '';
  if (branchEl) branchEl.value = settings.branch || 'main';
  if (folderEl) folderEl.value = settings.translationsFolder || 'src';
  if (filenameEl) filenameEl.value = settings.translationsFilename || 'translations.yaml';
  if (languagesEl) languagesEl.value = settings.languages || 'en_US,de_DE,fr_FR';
  languages = settings.languages.split(',').map(l => l.trim()).filter(l => l);
}

function saveSettings() {
  settings.token = ($('github-token') as HTMLInputElement)?.value || '';
  settings.repo = ($('github-repo') as HTMLInputElement)?.value || '';
  settings.branch = ($('github-branch') as HTMLInputElement)?.value || 'main';
  settings.translationsFolder = ($('translations-folder') as HTMLInputElement)?.value || 'src';
  settings.translationsFilename = ($('translations-filename') as HTMLInputElement)?.value || 'translations.yaml';
  settings.languages = ($('languages') as HTMLInputElement)?.value || 'en_US,de_DE,fr_FR';
  languages = settings.languages.split(',').map(l => l.trim()).filter(l => l);

  // Save via Figma's clientStorage (through main.ts)
  parent.postMessage({ pluginMessage: { type: 'save-settings', settings: settings } }, '*');

  setStatus('Settings saved!', 'success');
  // Reset loaded keys when settings change
  existingKeys = {};
  keysLoaded = false;
  updateKeysStatus();
  renderTextList();
}

function toggleSettings() {
  $('settings-panel')?.classList.toggle('visible');
}

function updateKeysStatus() {
  const statusEl = $('keys-status');
  const keyCount = Object.keys(existingKeys).length;
  if (!statusEl) return;

  if (keysLoaded && keyCount > 0) {
    statusEl.textContent = `${keyCount} keys loaded`;
    statusEl.className = 'keys-status loaded';
  } else if (keysLoaded) {
    statusEl.textContent = 'No existing keys found';
    statusEl.className = 'keys-status';
  } else {
    statusEl.textContent = 'No keys loaded';
    statusEl.className = 'keys-status';
  }
}

// Decode base64 with proper UTF-8 support
function decodeBase64UTF8(base64: string): string {
  const cleanBase64 = base64.replace(/[\n\r]/g, '');
  const binaryString = atob(cleanBase64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return new TextDecoder('utf-8').decode(bytes);
}

// Encode string to base64 with proper UTF-8 support
function encodeBase64UTF8(str: string): string {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Parse YAML using js-yaml
function parseYaml(content: string): Record<string, string> {
  if (!content) return {};
  try {
    const parsed = yaml.load(content);
    if (typeof parsed === 'object' && parsed !== null) {
      // Convert all values to strings
      const result: Record<string, string> = {};
      for (const [key, value] of Object.entries(parsed)) {
        result[key] = String(value);
      }
      return result;
    }
    return {};
  } catch (e) {
    addDebug(`YAML parse error: ${e}`);
    return {};
  }
}

// Generate YAML using js-yaml
function toYaml(obj: Record<string, string>): string {
  // Sort keys for consistent output
  const sorted: Record<string, string> = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = obj[key];
  }
  return yaml.dump(sorted, {
    lineWidth: -1,  // Don't wrap lines
    quotingType: '"',
    forceQuotes: false
  });
}

async function fetchExistingKeys() {
  if (!settings.token || !settings.repo) {
    setStatus('Please configure GitHub settings first', 'error');
    toggleSettings();
    return;
  }

  const btn = $('fetch-keys-btn') as HTMLButtonElement;
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="loading loading-dark"></span> Loading...';
  }
  clearDebug();

  try {
    const [owner, repo] = settings.repo.split('/');
    const apiBase = 'https://api.github.com';
    const folder = settings.translationsFolder;
    const filename = settings.translationsFilename || 'translations.yaml';

    addDebug(`Settings:`);
    addDebug(`  Repo: ${owner}/${repo}`);
    addDebug(`  Branch: ${settings.branch}`);
    addDebug(`  Folder: ${folder}`);
    addDebug(`  Languages: ${languages.join(', ')}`);
    addDebug(`  Filename: ${filename}`);

    existingKeys = {};

    for (const lang of languages) {
      const filePath = `${folder}/${lang}/${filename}`;
      setStatus(`Loading ${filePath}...`, 'info');

      try {
        const url = `${apiBase}/repos/${owner}/${repo}/contents/${filePath}?ref=${settings.branch}`;
        addDebug(`Fetching: ${url}`);

        const res = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${settings.token}`,
            'Accept': 'application/vnd.github.v3+json'
          }
        });

        addDebug(`Response: ${res.status} ${res.statusText}`);

        if (res.ok) {
          const data = await res.json();
          const content = decodeBase64UTF8(data.content);
          const translations = parseYaml(content);
          addDebug(`Loaded ${Object.keys(translations).length} keys from ${lang}`);

          for (const [key, value] of Object.entries(translations)) {
            if (!existingKeys[key]) {
              existingKeys[key] = {};
            }
            existingKeys[key][lang] = value;
          }
        } else if (res.status === 404) {
          addDebug(`File not found: ${filePath}`);
        } else {
          const errData = await res.json().catch(() => ({}));
          addDebug(`ERROR: ${res.status} - ${errData.message || res.statusText}`);
        }
      } catch (e) {
        addDebug(`NETWORK ERROR: ${(e as Error).message}`);
      }
    }

    keysLoaded = true;
    updateKeysStatus();
    setStatus(`Loaded ${Object.keys(existingKeys).length} existing keys`, 'success');
    renderTextList();

  } catch (error) {
    setStatus('Error loading keys: ' + (error as Error).message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = 'Load existing keys';
    }
  }
}

function searchKeys(query: string, nodeIndex: number) {
  if (!query || query.length < 1 || !keysLoaded) {
    hideDropdown(nodeIndex);
    return;
  }

  const dropdown = $(`dropdown-${nodeIndex}`);
  if (!dropdown) return;

  const lowerQuery = query.toLowerCase();
  const results: Array<{ key: string; translations: Record<string, string>; matchedIn: string[] }> = [];

  for (const [key, translations] of Object.entries(existingKeys)) {
    const matchedIn: string[] = [];

    if (key.toLowerCase().includes(lowerQuery)) {
      matchedIn.push('key');
    }

    for (const [lang, value] of Object.entries(translations)) {
      if (value.toLowerCase().includes(lowerQuery)) {
        matchedIn.push(lang);
      }
    }

    if (matchedIn.length > 0) {
      results.push({ key, translations, matchedIn });
    }
  }

  const limitedResults = results.slice(0, 10);

  if (limitedResults.length === 0) {
    dropdown.innerHTML = '<div class="search-result" style="color: #999; cursor: default;">No matching keys found</div>';
  } else {
    dropdown.innerHTML = limitedResults.map(r => {
      const previews = languages.map(lang => {
        const val = r.translations[lang] || '';
        const isMatch = r.matchedIn.includes(lang);
        const truncated = val.length > 25 ? val.slice(0, 25) + '...' : val;
        return `<span class="search-result-lang ${isMatch ? 'search-result-match' : ''}">${lang}</span>${escapeHtml(truncated)}`;
      }).join(' ');

      return `
        <div class="search-result" onclick="window.uiSelectKey(${nodeIndex}, '${escapeHtml(r.key).replace(/'/g, "\\'")}')">
          <div class="search-result-key ${r.matchedIn.includes('key') ? 'search-result-match' : ''}">${escapeHtml(r.key)}</div>
          <div class="search-result-preview">${previews}</div>
        </div>
      `;
    }).join('');
  }

  dropdown.classList.add('visible');
}

function selectKey(nodeIndex: number, key: string) {
  const keyInput = $(`key-${nodeIndex}`) as HTMLInputElement;
  if (keyInput) {
    keyInput.value = key;
  }

  const translations = existingKeys[key] || {};
  languages.forEach(lang => {
    const textarea = $(`trans-${nodeIndex}-${lang}`) as HTMLTextAreaElement;
    if (textarea && translations[lang]) {
      textarea.value = translations[lang];
    }
  });

  hideDropdown(nodeIndex);
}

function hideDropdown(nodeIndex: number) {
  const dropdown = $(`dropdown-${nodeIndex}`);
  if (dropdown) {
    dropdown.classList.remove('visible');
  }
}

function hideAllDropdowns() {
  document.querySelectorAll('.search-dropdown').forEach(d => d.classList.remove('visible'));
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderTextList() {
  const container = $('text-list');
  const pushBtn = $('push-btn') as HTMLButtonElement;

  if (!container) return;

  if (textNodes.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M4 6h16M4 12h16M4 18h10"/>
        </svg>
        <div>No text elements selected</div>
        <div style="margin-top: 4px; font-size: 11px;">Select frames or text layers in Figma</div>
      </div>
    `;
    if (pushBtn) pushBtn.disabled = true;
    return;
  }

  const html = textNodes.map((node, i) => `
    <div class="text-item" data-id="${node.id}">
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
        <label style="font-size: 10px; color: #666; min-width: 45px; font-weight: 600;">Key</label>
        <div class="key-input-wrapper">
          <input type="text"
                 id="key-${i}"
                 value="${escapeHtml(node.suggestedKey)}"
                 placeholder="${keysLoaded ? 'Type to search existing keys...' : 'translation.key'}"
                 oninput="window.uiSearchKeys(this.value, ${i})"
                 onfocus="window.uiSearchKeys(this.value, ${i})"
                 autocomplete="off" />
          <div id="dropdown-${i}" class="search-dropdown"></div>
        </div>
        <button class="secondary small" onclick="window.uiApplyKeyToLayer(${i}, '${node.id}')" title="Rename layer to key">Apply</button>
      </div>
      ${languages.map(lang => `
        <div style="display: flex; align-items: flex-start; gap: 8px; margin-bottom: 6px;">
          <label style="font-size: 10px; color: #999; min-width: 45px; padding-top: 6px;">${lang}</label>
          <textarea
            id="trans-${i}-${lang}"
            rows="4"
            style="flex: 1;"
            placeholder="${lang === languages[0] ? escapeHtml(node.text) : 'Translation...'}"
          >${lang === languages[0] ? escapeHtml(node.text) : ''}</textarea>
        </div>
      `).join('')}
    </div>
  `).join('');

  container.innerHTML = html;
  if (pushBtn) pushBtn.disabled = false;
  setStatus(`${textNodes.length} text element(s) found${keysLoaded ? ' - type in key field to search' : ''}`, 'info');
}

function refreshSelection() {
  parent.postMessage({ pluginMessage: { type: 'get-selection' } }, '*');
}

function applyKeyToLayer(nodeIndex: number, nodeId: string) {
  const keyInput = $(`key-${nodeIndex}`) as HTMLInputElement;
  if (!keyInput) return;

  const key = keyInput.value.trim();
  if (!key) {
    setStatus('Please enter a key first', 'error');
    return;
  }

  parent.postMessage({
    pluginMessage: {
      type: 'rename-layer',
      nodeId: nodeId,
      newName: key
    }
  }, '*');
}

async function pushToGitHub() {
  if (!settings.token || !settings.repo) {
    setStatus('Please configure GitHub settings first', 'error');
    toggleSettings();
    return;
  }

  // Collect all unique keys and translations per language
  const translationsByLang: Record<string, Record<string, string>> = {};
  const allKeys: Set<string> = new Set();
  languages.forEach(lang => {
    translationsByLang[lang] = {};
  });

  textNodes.forEach((node, i) => {
    const keyInput = $('key-' + i) as HTMLInputElement;
    const key = keyInput ? keyInput.value.trim() : node.suggestedKey;

    if (key) {
      allKeys.add(key);
      languages.forEach(lang => {
        const textarea = $(`trans-${i}-${lang}`) as HTMLTextAreaElement;
        const value = textarea ? textarea.value.trim() : '';
        if (value) {
          translationsByLang[lang][key] = value;
        }
      });
    }
  });

  const keysArray = Array.from(allKeys);
  if (keysArray.length === 0) {
    setStatus('No translations to push', 'error');
    return;
  }

  const pushBtn = $('push-btn') as HTMLButtonElement;
  if (pushBtn) {
    pushBtn.disabled = true;
    pushBtn.innerHTML = '<span class="loading"></span> Pushing...';
  }

  try {
    const [owner, repo] = settings.repo.split('/');
    const apiBase = 'https://api.github.com';
    const folder = settings.translationsFolder;
    const filename = settings.translationsFilename || 'translations.yaml';

    // Build commit message with key names
    const keysList = keysArray.length <= 3
      ? keysArray.join(', ')
      : `${keysArray.slice(0, 3).join(', ')} (+${keysArray.length - 3} more)`;
    const commitMessage = `Update translations: ${keysList}`;

    setStatus('Fetching current files...', 'info');

    // Step 1: Get current branch ref
    const refRes = await fetch(
      `${apiBase}/repos/${owner}/${repo}/git/ref/heads/${settings.branch}`,
      {
        headers: {
          'Authorization': `Bearer ${settings.token}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      }
    );
    if (!refRes.ok) throw new Error('Failed to get branch ref');
    const refData = await refRes.json();
    const currentCommitSha = refData.object.sha;

    // Step 2: Get current commit to find tree
    const commitRes = await fetch(
      `${apiBase}/repos/${owner}/${repo}/git/commits/${currentCommitSha}`,
      {
        headers: {
          'Authorization': `Bearer ${settings.token}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      }
    );
    if (!commitRes.ok) throw new Error('Failed to get commit');
    const commitData = await commitRes.json();
    const baseTreeSha = commitData.tree.sha;

    // Step 3: Create blobs for each updated file
    const treeItems: Array<{path: string; mode: string; type: string; sha: string}> = [];

    for (const lang of languages) {
      const translations = translationsByLang[lang];
      if (Object.keys(translations).length === 0) continue;

      const filePath = `${folder}/${lang}/${filename}`;
      setStatus(`Processing ${lang}...`, 'info');

      // Fetch existing content
      let existingContent = '';
      try {
        const getRes = await fetch(
          `${apiBase}/repos/${owner}/${repo}/contents/${filePath}?ref=${settings.branch}`,
          {
            headers: {
              'Authorization': `Bearer ${settings.token}`,
              'Accept': 'application/vnd.github.v3+json'
            }
          }
        );
        if (getRes.ok) {
          const data = await getRes.json();
          existingContent = decodeBase64UTF8(data.content);
        }
      } catch (e) {
        // File doesn't exist yet
      }

      const existingTranslations = parseYaml(existingContent);
      const merged = { ...existingTranslations, ...translations };
      const newContent = toYaml(merged);

      // Create blob
      const blobRes = await fetch(
        `${apiBase}/repos/${owner}/${repo}/git/blobs`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${settings.token}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            content: newContent,
            encoding: 'utf-8'
          })
        }
      );
      if (!blobRes.ok) throw new Error(`Failed to create blob for ${lang}`);
      const blobData = await blobRes.json();

      treeItems.push({
        path: filePath,
        mode: '100644',
        type: 'blob',
        sha: blobData.sha
      });
    }

    if (treeItems.length === 0) {
      setStatus('No changes to push', 'info');
      return;
    }

    setStatus('Creating commit...', 'info');

    // Step 4: Create new tree
    const treeRes = await fetch(
      `${apiBase}/repos/${owner}/${repo}/git/trees`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${settings.token}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          base_tree: baseTreeSha,
          tree: treeItems
        })
      }
    );
    if (!treeRes.ok) throw new Error('Failed to create tree');
    const treeData = await treeRes.json();

    // Step 5: Create commit
    const newCommitRes = await fetch(
      `${apiBase}/repos/${owner}/${repo}/git/commits`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${settings.token}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: commitMessage,
          tree: treeData.sha,
          parents: [currentCommitSha]
        })
      }
    );
    if (!newCommitRes.ok) throw new Error('Failed to create commit');
    const newCommitData = await newCommitRes.json();

    // Step 6: Update branch ref
    const updateRefRes = await fetch(
      `${apiBase}/repos/${owner}/${repo}/git/refs/heads/${settings.branch}`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${settings.token}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sha: newCommitData.sha
        })
      }
    );
    if (!updateRefRes.ok) {
      const err = await updateRefRes.json();
      throw new Error(err.message || 'Failed to update branch');
    }

    // Update local cache
    textNodes.forEach((node, i) => {
      const keyInput = $('key-' + i) as HTMLInputElement;
      const key = keyInput ? keyInput.value.trim() : '';
      if (key) {
        if (!existingKeys[key]) existingKeys[key] = {};
        languages.forEach(lang => {
          const textarea = $(`trans-${i}-${lang}`) as HTMLTextAreaElement;
          const value = textarea ? textarea.value.trim() : '';
          if (value) {
            existingKeys[key][lang] = value;
          }
        });
      }
    });
    updateKeysStatus();

    setStatus(`✓ Pushed translations to GitHub!`, 'success');
    parent.postMessage({ pluginMessage: { type: 'notify', message: 'Translations pushed to GitHub!' } }, '*');

  } catch (error) {
    setStatus('Error: ' + (error as Error).message, 'error');
  } finally {
    if (pushBtn) {
      pushBtn.disabled = false;
      pushBtn.innerHTML = 'Push to GitHub';
    }
  }
}

// Handle messages from plugin
window.onmessage = (event) => {
  const msg = event.data.pluginMessage;
  if (!msg) return;

  if (msg.type === 'selection-result' || msg.type === 'selection-changed') {
    textNodes = msg.nodes || [];
    renderTextList();
  }

  if (msg.type === 'settings-loaded' && msg.settings) {
    settings = { ...settings, ...msg.settings };
    applySettingsToUI();
  }

  if (msg.type === 'settings-saved') {
    if (msg.success) {
      setStatus('Settings saved!', 'success');
    } else {
      setStatus('Failed to save settings', 'error');
    }
  }
};

// Close dropdowns when clicking outside
document.addEventListener('click', (e) => {
  if (!(e.target as HTMLElement).closest('.key-input-wrapper')) {
    hideAllDropdowns();
  }
});

// Expose functions to window for inline handlers
declare global {
  interface Window {
    uiSaveSettings: typeof saveSettings;
    uiToggleSettings: typeof toggleSettings;
    uiFetchExistingKeys: typeof fetchExistingKeys;
    uiPushToGitHub: typeof pushToGitHub;
    uiRefreshSelection: typeof refreshSelection;
    uiSearchKeys: typeof searchKeys;
    uiSelectKey: typeof selectKey;
    uiApplyKeyToLayer: typeof applyKeyToLayer;
    uiToggleDebug: typeof toggleDebug;
  }
}

window.uiSaveSettings = saveSettings;
window.uiToggleSettings = toggleSettings;
window.uiFetchExistingKeys = fetchExistingKeys;
window.uiPushToGitHub = pushToGitHub;
window.uiRefreshSelection = refreshSelection;
window.uiSearchKeys = searchKeys;
window.uiApplyKeyToLayer = applyKeyToLayer;
window.uiToggleDebug = toggleDebug;
window.uiSelectKey = selectKey;

// Initialize
applySettingsToUI();
