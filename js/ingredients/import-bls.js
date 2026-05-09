/**
 * BLS Template Import Module
 * 
 * Verwaltet den Import von BLS-Vorlagen in Zutaten:
 * - Modal für Template-Auswahl
 * - Suche und Filterung
 * - Import mit automatischen Notizen
 */

class BLSTemplateImporter {
  constructor() {
    this.currentIngredient = null;
    this.currentIngredientElement = null;
    this.filteredTemplates = [];
  }

  /**
   * Öffne das Import-Modal für eine Zutat
   */
  openImportModal(ingredientName, ingredientElement) {
    this.currentIngredient = ingredientName;
    this.currentIngredientElement = ingredientElement;
    this._showModal(ingredientName);
  }

  /**
   * Zeige das Modal - alle 7140 Einträge durchsuchbar
   */
  _showModal(prefill = '') {
    const modal = document.getElementById('blsImportModal');
    const list = document.getElementById('blsTemplateList');
    const searchInput = document.getElementById('blsTemplateSearch');

    // Suche vorbelegen mit Zutat-Namen, Liste noch leer
    list.innerHTML = '<div class="bls-hint">Tippe mindestens 2 Zeichen um zu suchen…</div>';
    searchInput.value = prefill;

    // Alten Listener entfernen und neu setzen
    const newInput = searchInput.cloneNode(true);
    searchInput.parentNode.replaceChild(newInput, searchInput);
    newInput.addEventListener('input', (e) => this._filterTemplates(e.target.value, list));

    // Wenn prefill lang genug, sofort filtern
    if (prefill.length >= 2) {
      this._filterTemplates(prefill, list);
    }

    modal.classList.remove('hidden');
    newInput.focus();
    newInput.select();
  }

  /**
   * Filtere alle Templates nach Suchtext
   */
  _filterTemplates(searchText, list) {
    const needle = searchText.trim().toLowerCase();

    if (needle.length < 2) {
      list.innerHTML = '<div class="bls-hint">Tippe mindestens 2 Zeichen um zu suchen…</div>';
      return;
    }

    const matches = BLS_TEMPLATES.filter(t =>
      t.name.toLowerCase().includes(needle)
    );

    if (matches.length === 0) {
      list.innerHTML = '<div class="bls-hint">Keine Treffer gefunden.</div>';
      return;
    }

    // Fragment für Performance
    const fragment = document.createDocumentFragment();
    matches.forEach(template => {
      const item = document.createElement('div');
      item.className = 'bls-template-item';
      item.innerHTML = `
        <div class="bls-template-name">${this._escapeHtml(template.name)}</div>
        <div class="bls-template-macro">
          ${template.macros?.kcal ?? '?'} kcal · 
          ${template.macros?.protein ?? '?'}g P · 
          ${template.macros?.fat ?? '?'}g F · 
          ${template.macros?.carbs ?? '?'}g KH
        </div>
      `;
      item.addEventListener('click', () => this._importTemplate(template));
      fragment.appendChild(item);
    });

    list.innerHTML = `<div class="bls-hint">${matches.length} Treffer</div>`;
    list.appendChild(fragment);
  }

  /**
   * Importiere ein Template in die aktuelle Zutat
   */
  _importTemplate(template) {
    const today = new Date().toLocaleDateString('de-DE');
    const importNote = `Importiert von BLS: ${template.name} am ${today}`;

    // Trigger Custom Event - die Seite kann damit umgehen
    const event = new CustomEvent('blsTemplateImported', {
      detail: {
        ingredientName: this.currentIngredient,
        template: template,
        importNote: importNote,
      },
    });
    document.dispatchEvent(event);

    // Modal schließen
    this._closeModal();
  }

  /**
   * Schließe das Modal
   */
  _closeModal() {
    const modal = document.getElementById('blsImportModal');
    modal.classList.add('hidden');
    this.currentIngredient = null;
    this.currentIngredientElement = null;
    this.filteredTemplates = [];
  }

  /**
   * Escape HTML
   */
  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Globale Instanz
const blsImporter = new BLSTemplateImporter();

// Modal Schließen-Button Listener
document.addEventListener('DOMContentLoaded', () => {
  const closeBtn = document.getElementById('blsImportModalClose');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => blsImporter._closeModal());
  }

  // Klick außerhalb schließt auch
  const modal = document.getElementById('blsImportModal');
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        blsImporter._closeModal();
      }
    });
  }
});

// CSS für Modal (wird dynamisch eingefügt, falls nicht vorhanden)
const injectModalStyles = () => {
  if (document.getElementById('blsImportModalStyles')) return;

  const style = document.createElement('style');
  style.id = 'blsImportModalStyles';
  style.textContent = `
    #blsImportModal {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
      z-index: 1000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1rem;
    }

    #blsImportModal.hidden {
      display: none;
    }

    .bls-modal-content {
      background: white;
      border-radius: 0.75rem;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
      max-width: 500px;
      width: 100%;
      max-height: 80vh;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    .bls-modal-header {
      padding: 1.5rem;
      border-bottom: 1px solid #e5e7eb;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .bls-modal-header h2 {
      margin: 0;
      font-size: 1.25rem;
      font-weight: 600;
    }

    .bls-modal-header button {
      background: none;
      border: none;
      font-size: 1.5rem;
      cursor: pointer;
      color: #6b7280;
    }

    .bls-modal-header button:hover {
      color: #1f2937;
    }

    .bls-search-box {
      padding: 1rem 1.5rem;
      border-bottom: 1px solid #e5e7eb;
      background: #f9fafb;
    }

    .bls-search-box input {
      width: 100%;
      padding: 0.5rem 0.75rem;
      border: 1px solid #d1d5db;
      border-radius: 0.375rem;
      font-size: 0.95rem;
      box-sizing: border-box;
    }

    .bls-search-box input:focus {
      outline: none;
      border-color: #3b82f6;
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
    }

    #blsTemplateList {
      flex: 1;
      overflow-y: auto;
      padding: 0.5rem;
    }

    .bls-template-item {
      padding: 0.75rem;
      margin: 0.25rem 0;
      border: 1px solid #e5e7eb;
      border-radius: 0.375rem;
      cursor: pointer;
      transition: all 0.2s;
    }

    .bls-template-item:hover {
      background: #3b82f6;
      color: white;
      border-color: #3b82f6;
    }

    .bls-template-name {
      font-weight: 500;
      font-size: 0.95rem;
      margin-bottom: 0.25rem;
    }

    .bls-template-macro {
      font-size: 0.8rem;
      opacity: 0.8;
    }

    .bls-template-item:hover .bls-template-macro {
      opacity: 1;
    }

    .bls-hint {
      padding: 0.5rem 0.75rem;
      font-size: 0.8rem;
      color: #6b7280;
    }
  `;

  document.head.appendChild(style);
};

// Injiziere Styles wenn Modul geladen wird
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', injectModalStyles);
} else {
  injectModalStyles();
}
