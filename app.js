'use strict';

// Data and UI state
const STORE = 'stilltime-data-v1';
const DEFAULTS = {
  version:1, categories:[], extraLabels:[], blocks:[], timer: {
    mode:'idle', startedAt:null, accumulated:0
  }
};
const getElement = selector => document.querySelector(selector);
const clone = x => JSON.parse(JSON.stringify(x));
function load() {
  try {
    const raw = localStorage.getItem(STORE);
    if(!raw)return clone(DEFAULTS);
    const parsed = JSON.parse(raw);
    if(!Array.isArray(parsed.blocks) || !Array.isArray(parsed.categories) || !parsed.timer)throw Error('Ungültige Daten');
    // Remove only unused labels shipped by older versions; never touch used entries.
    const oldDefaults = new Set(['study', 'projects', 'personal']);
    const used = new Set(parsed.blocks.map(b => b.categoryId));
    const cleaned = parsed.categories.filter(c => !oldDefaults.has(c.id) || used.has(c.id));
    if(cleaned.length !== parsed.categories.length) {
      parsed.categories = cleaned;
      localStorage.setItem(STORE, JSON.stringify(parsed));
    }
    if (!Array.isArray(parsed.extraLabels)) parsed.extraLabels = [];
    for (const block of parsed.blocks) {
      for (const label of block.extras || []) {
        const known = parsed.extraLabels.some(
          name => name.toLocaleLowerCase('de') === label.toLocaleLowerCase('de')
        );
        if (!known) parsed.extraLabels.push(label);
      }
    }
    return parsed;
  } catch(err) {
    console.error('Daten konnten nicht geladen werden', err);
    return clone(DEFAULTS);
  }
}

let data = load();
let selectedDate = startOfDay(new Date());
let calendarMonday = startOfWeek(selectedDate);
let editingId = null;
let timerTick = null;
let toastTimeout = null;
function persist() {
  try {
    localStorage.setItem(STORE, JSON.stringify(data));
    return true
  } catch(err) {
    console.error(err);
    toast('Speichern fehlgeschlagen: Speicher prüfen');
    return false
  }
}

function toast(message) {
  const el = getElement('#toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(()=>el.classList.remove('show'), 2700)
}

function pad(n) {
  return String(n).padStart(2, '0')
}

function dayKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d
}

function startOfWeek(date) {
  const d = startOfDay(date);
  d.setDate(d.getDate() - (d.getDay() + 6) % 7);
  return d
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d
}

function endOfDay(date) {
  return addDays(startOfDay(date), 1)
}

function dateTimeInput(date) {
  const d = new Date(date);
  return `${dayKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function toMs(duration) {
  return Math.max(0, Math.floor(duration))
}

function durationText(ms) {
  const minutes = Math.floor(Math.max(0, ms) / 60000);
  return `${Math.floor(minutes / 60)}h ${pad(minutes % 60)}m`
}

function timerText(ms) {
  const sec = Math.floor(Math.max(0, ms) / 1000);
  return [Math.floor(sec / 3600), Math.floor(sec % 3600 / 60), sec % 60].map(pad).join(':')
}

function id() {
  return (globalThis.crypto ?.randomUUID ?.() || `id-${Date.now()}-${Math.random().toString(36).slice(2)}`)
}

function categoryFor(block) {
  return data.categories.find(c=>c.id === block.categoryId) || {
    name:'Ohne Hauptlabel', color:'#8f98aa'
  }
}

function fmtTime(date) {
  return new Date(date).toLocaleTimeString('de-DE', {
    hour:'2-digit', minute:'2-digit'
  })
}

function humanDate(date) {
  return new Date(date).toLocaleDateString('de-DE', {
    weekday:'long', day:'numeric', month:'long'
  })
}

function overlap(block, from, to) {
  const left = Math.max(Number(block.start), Number(from));
  const right = Math.min(Number(block.end), Number(to));
  return Math.max(0, right - left)
}

function getElapsed() {
  const t = data.timer;
  return toMs(t.accumulated + (t.mode === 'running' ? Math.max(0, Date.now() - t.startedAt):0))
}

function updateTimer() {
  const t = data.timer;
  getElement('#timerDisplay').textContent = timerText(getElapsed());
  const action = t.mode === 'running' ? 'Pausieren':t.mode === 'paused' ? 'Fortsetzen':'Starten';
  getElement('#mainTimerButton').setAttribute('aria-label', action);
  getElement('#mainTimerButton').title = action;
  getElement('#playIcon').classList.toggle('hidden', t.mode === 'running');
  getElement('#pauseIcon').classList.toggle('hidden', t.mode !== 'running');
  getElement('#finishButton').classList.toggle('hidden', t.mode === 'idle');
  getElement('#resetButton').classList.toggle('hidden', t.mode === 'idle')
}

function timerAction() {
  const t = data.timer;
  if(t.mode === 'idle') {
    t.mode = 'running';
    t.accumulated = 0;
    t.startedAt = Date.now()
  } else if(t.mode === 'running') {
    t.accumulated = getElapsed();
    t.startedAt = null;
    t.mode = 'paused'
  } else {
    t.startedAt = Date.now();
    t.mode = 'running'
  }
  persist();
  updateTimer()
}

function resetTimer() {
  if(!confirm('Willst du diese Session Zeit wirklich verwerfen?'))return;
  data.timer = {
    mode:'idle', startedAt:null, accumulated:0
  };
  persist();
  updateTimer()
}

function finishTimer() {
  const ms = getElapsed();
  if(ms < 1000) {
    toast('gib mir eine Sekunde ;)');
    return
  }
  const end = Date.now();
  const start = end - ms;
  const t = data.timer;
  const previous = clone(t);
  data.timer = {
    mode:'idle', startedAt:null, accumulated:0
  };
  persist();
  updateTimer();
  openEntry( {
    start, end, categoryId:null, extras:[], note:''
  }, null, ()=> {
    data.timer = previous;if(previous.mode === 'running')previous.startedAt = Date.now();persist();updateTimer()
  })
}

let cancelEntry = null;
let selectedExtraLabels = [];

// Entry labels
function normalizeExtra(s) {
  return s.trim().replace(/\s+/g, ' ')
}

function knownExtras() {
  const names = [...(data.extraLabels || [])];
  for(const block of data.blocks)for(const s of (block.extras || [])) if(!names.some(x=>x.toLocaleLowerCase('de') === s.toLocaleLowerCase('de')))names.push(s);
  return names.sort((a, b)=>a.localeCompare(b, 'de'))
}

function renderExtraChips() {
  const container = getElement('#selectedExtras');
  container.replaceChildren();
  for(const label of selectedExtraLabels) {
    const chip = document.createElement('span');
    chip.className = 'extra-chip';
    const name = document.createElement('span');
    name.textContent = label;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = '×';
    remove.setAttribute('aria-label', `${label} entfernen`);
    remove.addEventListener('click', ()=> {
      selectedExtraLabels = selectedExtraLabels.filter(s=>s !== label);renderExtraChips();renderExtraSuggestions()
    });
    chip.append(name, remove);
    container.append(chip)
  }
}

function toggleExtraPicker(open) {
  getElement('#extraPicker').classList.toggle('hidden', !open);
  getElement('#addExtraButton').setAttribute('aria-expanded', String(open));
  if(open) {
    getElement('#extraSearch').value = '';
    renderExtraSuggestions();
    getElement('#extraSearch').focus()
  }
}

function selectExtraLabel(label) {
  const normalized = normalizeExtra(label);
  if(!normalized)return;
  const canonical = knownExtras().find(s=>s.toLocaleLowerCase('de') === normalized.toLocaleLowerCase('de')) || normalized;
  if(!selectedExtraLabels.some(s=>s.toLocaleLowerCase('de') === canonical.toLocaleLowerCase('de')))selectedExtraLabels.push(canonical);
  renderExtraChips();
  toggleExtraPicker(false)
}

function renderExtraSuggestions() {
  const root = getElement('#extraSuggestions');
  root.replaceChildren();
  const q = normalizeExtra(getElement('#extraSearch').value);
  const key = q.toLocaleLowerCase('de');
  const candidates = knownExtras().filter(s=>!selectedExtraLabels.some(t=>t.toLocaleLowerCase('de') === s.toLocaleLowerCase('de')) && s.toLocaleLowerCase('de').includes(key));
  for(const label of candidates) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'extra-suggestion';
    btn.setAttribute('role', 'option');
    btn.textContent = label;
    btn.addEventListener('click', ()=>selectExtraLabel(label));
    root.append(btn)
  }
  if(q && !knownExtras().some(s=>s.toLocaleLowerCase('de') === key)) {
    const create = document.createElement('button');
    create.type = 'button';
    create.className = 'extra-suggestion create';
    create.textContent = `+ „${q}“ erstellen`;
    create.addEventListener('click', ()=>selectExtraLabel(q));
    root.append(create)
  }
  if(!root.childElementCount) {
    const empty = document.createElement('div');
    empty.className = 'extra-empty';
    empty.textContent = q ? 'Keine weiteren Treffer':'Noch keine Labels vorhanden';
    root.append(empty)
  }
}

function openEntry(block = null, recordId = null, onCancel = null) {
  editingId = recordId;
  cancelEntry = onCancel;
  getElement('#formError').textContent = '';
  const now = Date.now();
  const b = block || {
    start:now - 3600000, end:now, categoryId:null, extras:[], note:''
  };
  getElement('#dialogTitle').textContent = recordId ? 'Eintrag bearbeiten':'Eintrag speichern';
  getElement('#entryStart').value = dateTimeInput(b.start);
  getElement('#entryEnd').value = dateTimeInput(b.end);
  selectedExtraLabels = [...(b.extras || [])];
  renderExtraChips();
  toggleExtraPicker(false);
  getElement('#entryNote').value = b.note || '';
  getElement('#newCategoryName').value = '';
  getElement('#newCategoryColor').value = '#86efac';
  getElement('#newCategoryFields').classList.add('hidden');
  getElement('#deleteEntry').classList.toggle('hidden', !recordId);
  populateCategories();
  getElement('#mainLabel').value = data.categories.some(c=>c.id === b.categoryId) ? b.categoryId:(data.categories.length ? '':'new');
  getElement('#newCategoryFields').classList.toggle('hidden', getElement('#mainLabel').value !== 'new');
  getElement('#entryDialog').showModal()
}

function closeEntry() {
  if(!getElement('#entryDialog').open)return;
  getElement('#entryDialog').close();
  if(cancelEntry)cancelEntry();
  cancelEntry = null
}

function populateCategories() {
  const s = getElement('#mainLabel');
  s.replaceChildren();
  if(data.categories.length) {
    const placeholder = new Option('Hauptlabel wählen', '');
    placeholder.disabled = true;
    s.add(placeholder)
  }
  for(const c of data.categories) {
    const o = document.createElement('option');
    o.value = c.id;
    o.textContent = c.name;
    s.appendChild(o)
  }
  const o = document.createElement('option');
  o.value = 'new';
  o.textContent = '+ Neues Hauptlabel';
  s.appendChild(o)
}

function saveEntry(event) {
  event.preventDefault();
  const start = new Date(getElement('#entryStart').value).getTime(), end = new Date(getElement('#entryEnd').value).getTime();
  if(!Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
    getElement('#formError').textContent = 'Zeitparadoxon! (Das Ende muss nach dem Beginn liegen.)';
    return
  }
  const conflicting = data.blocks.find(b=>b.id !== editingId && b.start < end && start < b.end);
  if(conflicting) {
    getElement('#formError').textContent = `Überschneidung mit ${fmtTime(conflicting.start)}–${fmtTime(conflicting.end)} (${categoryFor(conflicting).name}).`;
    return
  }
  let categoryId = getElement('#mainLabel').value;
  if(!categoryId) {
    getElement('#formError').textContent = 'Bitte ein Hauptlabel auswählen.';
    return
  }
  if(categoryId === 'new') {
    const name = getElement('#newCategoryName').value.trim();
    if(!name) {
      getElement('#formError').textContent = 'Bitte einen Namen für das Hauptlabel angeben.';
      return
    }
    const existing = data.categories.find(c=>c.name.toLocaleLowerCase('de') === name.toLocaleLowerCase('de'));
    if(existing)categoryId = existing.id;
    else {
      const newCat = {
        id:id(), name, color:getElement('#newCategoryColor').value
      };
      data.categories.push(newCat);
      categoryId = newCat.id
    }
  } const extras = [...selectedExtraLabels];
  for(const label of extras)if(!data.extraLabels.some(s=>s.toLocaleLowerCase('de') === label.toLocaleLowerCase('de')))data.extraLabels.push(label);
  const b = {
    id:editingId || id(), start, end, categoryId, extras, note:getElement('#entryNote').value.trim()
  };
  const index = data.blocks.findIndex(x=>x.id === editingId);
  if(index >= 0)data.blocks[index] = b;
  else data.blocks.push(b);
  if(!persist())return;
  cancelEntry = null;
  getElement('#entryDialog').close();
  renderAll();
  toast('Session gespeichert')
}

function deleteEntry() {
  if(!editingId || !confirm('Dies Session löschen?'))return;
  data.blocks = data.blocks.filter(b=>b.id !== editingId);
  if(!persist())return;
  cancelEntry = null;
  getElement('#entryDialog').close();
  renderAll();
  toast('Eintrag gelöscht')
}

function blockElement(b) {
  const cat = categoryFor(b);
  const button = document.createElement('button');
  button.className = 'block';
  button.type = 'button';
  const stripe = document.createElement('span');
  stripe.className = 'block-stripe';
  stripe.style.background = cat.color;
  const body = document.createElement('div');
  body.className = 'block-body';
  const top = document.createElement('div');
  top.className = 'block-top';
  const title = document.createElement('span');
  title.className = 'block-title';
  title.textContent = cat.name;
  const dur = document.createElement('span');
  dur.className = 'block-duration';
  dur.textContent = durationText(b.end - b.start);
  top.append(title, dur);
  const meta = document.createElement('div');
  meta.className = 'block-meta';
  meta.textContent = `${fmtTime(b.start)}–${fmtTime(b.end)}${b.extras ?.length ? ' · ' + b.extras.join(', '):''}`;
  body.append(top, meta);
  if(b.note) {
    const note = document.createElement('div');
    note.className = 'block-note';
    note.textContent = b.note;
    body.append(note)
  }
  button.append(stripe, body);
  button.addEventListener('click', ()=>openEntry(b, b.id));
  return button
}

function renderBlocks(container, blocks, emptyText) {
  container.replaceChildren();
  if(!blocks.length) {
    const el = document.createElement('div');
    el.className = 'empty';
    el.textContent = emptyText;
    container.append(el);
    return
  }
  blocks.forEach(b=>container.appendChild(blockElement(b)))
}

function renderCalendar() {
  const end = addDays(calendarMonday, 6);
  const fmt = d=>d.toLocaleDateString('de-DE', {
    day:'numeric', month:'short'
  });
  getElement('#calendarRange').textContent = `${fmt(calendarMonday)} – ${fmt(end)} ${end.getFullYear()}`;
  const grid = getElement('#weekGrid');
  grid.replaceChildren();
  for(let i = 0;i < 7;i++) {
    const date = addDays(calendarMonday, i);
    const btn = document.createElement('button');
    btn.className = 'week-day' + (dayKey(date) === dayKey(selectedDate) ? ' active':'');
    const name = document.createElement('div');
    name.className = 'week-day-name';
    name.textContent = ['MO', 'DI', 'MI', 'DO', 'FR', 'SA', 'SO'][i];
    const number = document.createElement('div');
    number.className = 'week-day-number';
    number.textContent = date.getDate();
    const dots = document.createElement('div');
    dots.className = 'day-dots';
    const dayCats = [...new Set(data.blocks.filter(b=>overlap(b, date, endOfDay(date)) > 0).map(b=>b.categoryId))].slice(0, 3);
    for(const c of dayCats) {
      const dot = document.createElement('span');
      dot.className = 'day-dot';
      dot.style.background = data.categories.find(x=>x.id === c) ?.color || '#8f98aa';
      dots.append(dot)
    } btn.append(name, number, dots);
    btn.addEventListener('click', ()=> {
      selectedDate = date;renderCalendar()
    });
    grid.append(btn);
  } getElement('#selectedDateTitle').textContent = humanDate(selectedDate);
  const timeline = getElement('#dayTimeline');
  timeline.replaceChildren();
  const dayStart = + startOfDay(selectedDate), dayEnd = + endOfDay(selectedDate), dayLength = dayEnd - dayStart;
  const rail = document.createElement('div');
  rail.className = 'timeline-rail';
  const lane = document.createElement('div');
  lane.className = 'timeline-lane';
  // All 24 clock-hour markers are displayed, including daylight-saving transition days.
  for(let hour = 0;hour <= 24;hour++) {
    const marker = document.createElement('div');
    marker.className = 'timeline-hour';
    marker.style.top = `${hour / 24 * 100}%`;
    marker.textContent = `${pad(hour)}:00`;
    rail.append(marker);
    const line = document.createElement('div');
    line.className = 'timeline-line';
    line.style.top = `${hour / 24 * 100}%`;
    lane.append(line);
  } for(const block of data.blocks.filter(b=>overlap(b, dayStart, dayEnd) > 0).sort((a, b)=>a.start - b.start)) {
    const cat = categoryFor(block);
    const from = Math.max(block.start, dayStart), to = Math.min(block.end, dayEnd);
    // Convert local clock times to positions on the full 00:00–24:00 axis.
    const clockMinutes = d=> {
      const x = new Date(d);
      return x.getHours() * 60 + x.getMinutes() + x.getSeconds() / 60
    };
    const begin = from === dayEnd ? 1440:clockMinutes(from);
    const finish = to === dayEnd ? 1440:clockMinutes(to);
    const top = Math.max(0, begin / 1440 * 100), height = Math.max(0.3, (finish - begin) / 1440 * 100);
    const entry = document.createElement('button');
    entry.type = 'button';
    entry.className = 'timeline-entry';
    entry.style.top = `${top}%`;
    entry.style.height = `${height}%`;
    entry.style.setProperty('--entry-color', cat.color);
    const name = document.createElement('span');
    name.className = 'timeline-entry-name';
    name.textContent = cat.name;
    const time = document.createElement('span');
    time.className = 'timeline-entry-time';
    time.textContent = `${fmtTime(from)}–${to === dayEnd ? '24:00':fmtTime(to)}`;
    entry.append(name, time);
    if(block.extras ?.length && height > 3) {
      const tags = document.createElement('span');
      tags.className = 'timeline-entry-tags';
      tags.textContent = block.extras.join(' · ');
      entry.append(tags)
    } entry.title = `${cat.name} · ${time.textContent}${block.note ? ' · ' + block.note:''}`;
    entry.setAttribute('aria-label', entry.title + '; bearbeiten');
    entry.addEventListener('click', ()=>openEntry(block, block.id));
    lane.append(entry);
  } timeline.append(rail, lane);
}
// Each group is a conjunction; groups are combined by disjunction.
let analysisGroups = [];

function analysisOptions() {
  return [
    ...data.categories.map(c => ({ key: `cat:${c.id}`, name: c.name, type: 'Hauptlabel', color: c.color })),
    ...knownExtras().map(name => ({ key: `tag:${name}`, name, type: 'Zusatzlabel' }))
  ];
}

function analysisButton(text, action, className = 'extra-add-button') {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = text;
  button.addEventListener('click', action);
  return button;
}

function refreshAnalysisFilters() {
  renderAnalysisGroups();
  renderAnalysis();
}

function renderAnalysisGroups() {
  const root = getElement('#analysisGroups');
  root.replaceChildren();
  const options = analysisOptions();
  if (!analysisGroups.length) {
    const all = document.createElement('span');
    all.className = 'analysis-all-label';
    all.textContent = 'Alle Labels';
    root.append(all);
  }
  analysisGroups.forEach((group, index) => {
    if (index > 0) {
      const or = document.createElement('div');
      or.className = 'group-operator';
      or.textContent = 'OR';
      root.append(or);
    }
    const panel = document.createElement('div');
    panel.className = 'analysis-group';
    const header = document.createElement('div');
    header.className = 'group-header';
    header.textContent = `Gruppe ${index + 1}`;
    const removeGroup = analysisButton('×', () => {
      analysisGroups = analysisGroups.filter(g => g !== group);
      refreshAnalysisFilters();
    }, 'group-remove');
    removeGroup.setAttribute('aria-label', `Gruppe ${index + 1} entfernen`);
    header.append(removeGroup);
    panel.append(header);
    const chips = document.createElement('div');
    chips.className = 'extra-chips';
    group.forEach((key, i) => {
      const opt = options.find(o => o.key === key);
      if (!opt) return;
      if (i > 0) {
        const and = document.createElement('span');
        and.className = 'group-operator';
        and.textContent = 'AND';
        chips.append(and);
      }
      const chip = document.createElement('span');
      chip.className = 'extra-chip';
      if (opt.color) {
        const dot = document.createElement('span');
        dot.className = 'breakdown-color';
        dot.style.background = opt.color;
        chip.append(dot);
      }
      const label = document.createElement('span');
      label.textContent = opt.name;
      const remove = analysisButton('×', () => {
        group.splice(group.indexOf(key), 1);
        refreshAnalysisFilters();
      }, '');
      remove.setAttribute('aria-label', `${opt.name} entfernen`);
      chip.append(label, remove);
      chips.append(chip);
    });
    panel.append(chips);
    const picker = document.createElement('div');
    picker.className = 'extra-picker hidden';
    const search = document.createElement('input');
    search.type = 'search';
    search.placeholder = 'Haupt- oder Zusatzlabel suchen';
    search.setAttribute('aria-label', search.placeholder);
    const suggestions = document.createElement('div');
    suggestions.className = 'extra-suggestions';
    const renderSuggestions = () => {
      suggestions.replaceChildren();
      const query = search.value.trim().toLocaleLowerCase('de');
      for (const opt of options.filter(o => !group.includes(o.key) &&
        `${o.name} ${o.type}`.toLocaleLowerCase('de').includes(query))) {
        const button = analysisButton(`${opt.color ? '●' : '#'} ${opt.name}`, () => {
          group.push(opt.key);
          refreshAnalysisFilters();
        }, 'extra-suggestion');
        if (opt.color) button.style.color = opt.color;
        suggestions.append(button);
      }
      if (!suggestions.childElementCount) suggestions.textContent = 'Keine weiteren Labels';
    };
    const add = analysisButton('+ Label', () => {
      const open = picker.classList.toggle('hidden') === false;
      add.setAttribute('aria-expanded', String(open));
      if (open) { search.value = ''; renderSuggestions(); search.focus(); }
    });
    add.setAttribute('aria-expanded', 'false');
    search.addEventListener('input', renderSuggestions);
    search.addEventListener('keydown', event => {
      if (event.key === 'Enter') { event.preventDefault(); suggestions.querySelector('button')?.click(); }
      if (event.key === 'Escape') { picker.classList.add('hidden'); add.setAttribute('aria-expanded', 'false'); add.focus(); }
    });
    picker.append(search, suggestions);
    panel.append(add, picker);
    root.append(panel);
  });
}

function populateAnalysisLabels() {
  const valid = new Set(analysisOptions().map(o => o.key));
  analysisGroups = analysisGroups.map(group => group.filter(key => valid.has(key)));
  renderAnalysisGroups();
}

function matchesLabel(block, key) {
  return key.startsWith('cat:') ? block.categoryId === key.slice(4) :
    (block.extras || []).some(label => label.toLocaleLowerCase('de') === key.slice(4).toLocaleLowerCase('de'));
}

function matchesAnalysisLabels(block) {
  const groups = analysisGroups.filter(group => group.length > 0);
  return groups.length === 0 || groups.some(group => group.every(key => matchesLabel(block, key)));
}

function analysisRange() {
  const p = getElement('#periodSelect').value;
  const today = new Date();
  if(p === 'week') {
    const from = startOfWeek(today);
    return {
      from, to:addDays(from, 7), label:'Diese Woche'
    }
  }
  if(p === 'lastweek') {
    const to = startOfWeek(today);
    return {
      from:addDays(to, - 7), to, label:'Letzte Woche'
    }
  }
  if(p === 'month') {
    const from = new Date(today.getFullYear(), today.getMonth(), 1);
    return {
      from, to:new Date(today.getFullYear(), today.getMonth() + 1, 1), label:'Dieser Monat'
    }
  }
  const from = startOfDay(new Date(getElement('#startDate').value + 'T00:00:00'));
  const to = endOfDay(new Date(getElement('#endDate').value + 'T00:00:00'));
  return {
    from, to, label:'Eigener Zeitraum'
  }
}

function renderAnalysis() {
  const range = analysisRange();
  getElement('#customDates').classList.toggle('hidden', getElement('#periodSelect').value !== 'custom');
  if(!Number.isFinite( + range.from) || !Number.isFinite( + range.to) || range.to <= range.from) {
    getElement('#analysisContext').textContent = 'Ungültiger Zeitraum';
    return
  }
  const blocks = data.blocks.filter(matchesAnalysisLabels).filter(b=>overlap(b, range.from, range.to) > 0);
  const total = blocks.reduce((s, b)=>s + overlap(b, range.from, range.to), 0);
  const days = Math.max(1, Math.round((range.to - range.from) / 86400000));
  getElement('#analysisTotal').textContent = durationText(total);
  getElement('#analysisContext').textContent = range.label;
  getElement('#dailyAverage').textContent = durationText(total / days);
  getElement('#blockCount').textContent = String(blocks.length);
  renderChart(blocks, range);
  renderBreakdown(blocks, range)
}

function renderChart(blocks, range) {
  const chart = getElement('#barChart'), selection = getElement('#barSelection');
  chart.replaceChildren();
  selection.textContent = '';
  let groups = [];
  const cursor = new Date(range.from);
  let guard = 0;
  while(cursor < range.to && guard++ < 400) {
    const next = addDays(cursor, 1), limit = next < range.to ? next:range.to;
    const segments = data.categories.map(cat=>( {
      cat, ms:blocks.filter(b=>b.categoryId === cat.id).reduce((s, b)=>s + overlap(b, cursor, limit), 0)
    })).filter(s=>s.ms > 0);
    groups.push( {
      date:new Date(cursor), segments, duration:segments.reduce((s, x)=>s + x.ms, 0), end:new Date(limit)
    });
    cursor.setFullYear(next.getFullYear(), next.getMonth(), next.getDate());
  } if(groups.length > 31) {
    const weekly = [];
    for(let i = 0;i < groups.length;i += 7) {
      const slice = groups.slice(i, i + 7), segments = data.categories.map(cat=>( {
        cat, ms:slice.reduce((sum, g)=>sum + (g.segments.find(s=>s.cat.id === cat.id) ?.ms || 0), 0)
      })).filter(s=>s.ms > 0);
      weekly.push( {
        date:slice[0].date, end:slice[slice.length - 1].end, segments, duration:segments.reduce((s, x)=>s + x.ms, 0)
      });
    }
    groups = weekly
  } const max = Math.max(1, ...groups.map(x=>x.duration));
  for(const g of groups) {
    const col = document.createElement('button');
    col.type = 'button';
    col.className = 'bar-col';
    const track = document.createElement('span');
    track.className = 'bar-track';
    const stack = document.createElement('span');
    stack.className = 'bar-stack';
    stack.style.height = `${g.duration ? Math.max(1, g.duration / max * 100):0}%`;
    for(const segment of g.segments) {
      const part = document.createElement('span');
      part.className = 'bar-segment';
      part.style.height = `${segment.ms / g.duration * 100}%`;
      part.style.background = segment.cat.color;
      part.title = `${segment.cat.name}: ${durationText(segment.ms)}`;
      stack.append(part)
    } track.append(stack);
    const day = document.createElement('span');
    day.className = 'bar-day';
    day.textContent = groups.length === 7 ? ['S', 'M', 'D', 'M', 'D', 'F', 'S'][g.date.getDay()]:`${g.date.getDate()}`;
    col.append(track, day);
    const label = `${g.date.toLocaleDateString('de-DE')}${g.end - g.date > 86400000 ? ' – ' + addDays(g.end, - 1).toLocaleDateString('de-DE'):''}`;
    col.setAttribute('aria-label', `${label}: ${durationText(g.duration)}`);
    col.addEventListener('click', ()=> {
      chart.querySelectorAll('.bar-col').forEach(x=>x.classList.remove('selected')); col.classList.add('selected'); selection.replaceChildren(); const heading = document.createElement('strong');heading.textContent = `${label}: ${durationText(g.duration)}`;selection.append(heading); if(g.segments.length) {
        const details = document.createElement('span');details.textContent = g.segments.map(s=>`${s.cat.name} ${durationText(s.ms)}`).join(' · ');selection.append(details)
      }
    });
    chart.append(col);
  } if(!groups.length)chart.textContent = 'Keine Daten im Zeitraum.';
}

function renderBreakdown(blocks, range) {
  const target = getElement('#categoryBreakdown');
  target.replaceChildren();
  const rows = data.categories.map(cat=>( {
    cat, ms:blocks.filter(b=>b.categoryId === cat.id).reduce((s, b)=>s + overlap(b, range.from, range.to), 0)
  })).filter(x=>x.ms > 0).sort((a, b)=>b.ms - a.ms);
  const max = rows[0] ?.ms || 1;
  if(!rows.length) {
    target.innerHTML = '<div class="empty">Noch keine erfasste Zeit in dieser Auswahl.</div>';
    return
  }
  for(const row of rows) {
    const div = document.createElement('div');
    div.className = 'breakdown-row';
    const name = document.createElement('div');
    name.className = 'breakdown-name';
    const dot = document.createElement('span');
    dot.className = 'breakdown-color';
    dot.style.background = row.cat.color;
    const text = document.createElement('span');
    text.textContent = row.cat.name;
    name.append(dot, text);
    const dur = document.createElement('div');
    dur.textContent = durationText(row.ms);
    const track = document.createElement('div');
    track.className = 'breakdown-track';
    const fill = document.createElement('div');
    fill.className = 'breakdown-fill';
    fill.style.background = row.cat.color;
    fill.style.width = `${row.ms / max * 100}%`;
    track.append(fill);
    div.append(name, dur, track);
    target.append(div)
  }
}

function renderAll() {
  renderCalendar();
  populateAnalysisLabels();
  renderAnalysis();
  updateTimer()
}

function setFocusMode(enabled) {
  document.body.classList.toggle('focus-mode', enabled);
}

function handleTimerAreaClick(event) {
  if (event.target.closest('button, a, input, select, textarea')) return;
  setFocusMode(!document.body.classList.contains('focus-mode'));
}

function showView(view) {
  if (view !== 'timer') setFocusMode(false);
  document.querySelectorAll('.view').forEach(x=>x.classList.toggle('active', x.id === `view-${view}`));
  document.querySelectorAll('.nav-item').forEach(x=> {
    const active = x.dataset.view === view;x.classList.toggle('active', active);if(active)x.setAttribute('aria-current', 'page');else x.removeAttribute('aria-current')
  });
  if(view === 'calendar')renderCalendar();
  if(view === 'analysis') {
    populateAnalysisLabels();
    renderAnalysis()
  }
}

function exportData() {
  const payload = {
    exportedAt:new Date().toISOString(), ...data
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type:'application/json'
  });
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = `stilltime-backup-${dayKey(new Date())}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(href), 1000);
  toast('Backup erstellt')
}
// Backup imports are validated completely before any existing data is replaced.
function validateBackup(payload) {
  if(!payload || typeof payload !== 'object' || Array.isArray(payload))throw Error('Keine gültige Backup-Datei.');
  if(!Array.isArray(payload.categories) || !Array.isArray(payload.blocks))throw Error('Kategorien oder Zeitblöcke fehlen.');
  if(payload.categories.length > 5000 || payload.blocks.length > 100000)throw Error('Die Datei enthält zu viele Einträge.');
  const seenCategories = new Set();
  const categories = payload.categories.map(c=> {
    if (
      !c || typeof c.id !== 'string' || !c.id || c.id.length > 150 ||
      typeof c.name !== 'string' || !c.name.trim() || c.name.length > 100 ||
      typeof c.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(c.color)
    ) {
      throw Error('Ungültiges Hauptlabel im Backup.');
    }
    if (seenCategories.has(c.id)) {
      throw Error('Ein Hauptlabel ist mehrfach vorhanden.');
    }
    seenCategories.add(c.id);
    return {
      id:c.id, name:c.name, color:c.color
    };
  });
  const seenBlocks = new Set();
  const blocks = payload.blocks.map(b=> {
    if (
      !b || typeof b.id !== 'string' || !b.id || b.id.length > 150 ||
      !Number.isFinite(b.start) || !Number.isFinite(b.end) ||
      b.start >= b.end || b.start < 0 || b.end > 8640000000000000
    ) {
      throw Error('Ungültige Session im Backup.');
    }
    if (seenBlocks.has(b.id)) {
      throw Error('Eine Session ist mehrfach vorhanden.');
    }
    seenBlocks.add(b.id);
    if (typeof b.categoryId !== 'string' || !seenCategories.has(b.categoryId)) {
      throw Error('Eine Session verweist auf ein unbekanntes Hauptlabel.');
    }
    if (!Array.isArray(b.extras) || b.extras.length > 200 ||
        !b.extras.every(x => typeof x === 'string' && x.length <= 100)) {
      throw Error('Ungültige Zusatzlabels im Backup.');
    }
    if (b.note !== undefined && typeof b.note !== 'string') {
      throw Error('Ungültige Notiz im Backup.');
    }
    return {
      id:b.id, start:b.start, end:b.end, categoryId:b.categoryId, extras:[...new Set(b.extras)], note:(b.note || '').slice(0, 2000)
    };
  });
  // A backup from an older version may contain overlaps; warn rather than silently dropping records.
  const sorted = [...blocks].sort((a, b)=>a.start - b.start);
  for(let i = 1;i < sorted.length;i++)if(sorted[i].start < sorted[i - 1].end)throw Error('Das Backup enthält überlappende Zeitblöcke. Es wurde nichts verändert.');
  if(payload.extraLabels !== undefined && !Array.isArray(payload.extraLabels))throw Error('Ungültige Zusatzlabel-Liste.');
  const extras = Array.isArray(payload.extraLabels) ? payload.extraLabels:[];
  if(extras.length > 10000 || !extras.every(x=>typeof x === 'string' && x.length <= 100))throw Error('Ungültige Zusatzlabel-Liste.');
  const extraLabels = [];
  for(const label of [...extras, ...blocks.flatMap(b=>b.extras)]) {
    if(!extraLabels.some(s=>s.toLocaleLowerCase('de') === label.toLocaleLowerCase('de')))extraLabels.push(label);
  }
  // Do not transfer a possibly months-old running timer from another origin.
  return {
    version:1, categories, extraLabels, blocks, timer:clone(DEFAULTS.timer)
  };
} async function importData(event) {
  const file = event.target.files ?.[0];
  event.target.value = '';
  // Allows importing the same file again if desired.
  if(!file)return;
  try {
    if(file.size > 10 * 1024 * 1024)throw Error('Backup ist größer als 10 MB.');
    const imported = validateBackup(JSON.parse(await file.text()));
    const text = `${imported.blocks.length} Zeitblöcke und ${imported.categories.length} Hauptlabels importieren?\n\nAlle aktuell in dieser App gespeicherten Einträge und Labels werden ersetzt. Der laufende Timer wird zurückgesetzt.\n\nVorher ggf. über ↥ ein Backup erstellen.`;
    if(!confirm(text))return;
    // Write first. If quota/storage is unavailable, preserve the current in-memory state.
    localStorage.setItem(STORE, JSON.stringify(imported));
    data = imported;
    editingId = null;
    selectedExtraLabels = [];
    analysisGroups = [];
    selectedDate = startOfDay(new Date());
    calendarMonday = startOfWeek(selectedDate);
    if(getElement('#entryDialog').open) {
      cancelEntry = null;
      getElement('#entryDialog').close()
    } renderAll();
    toast(`${imported.blocks.length} Zeitblöcke importiert`);
  } catch(error) {
    console.error('Import fehlgeschlagen', error);
    alert(`Import fehlgeschlagen: ${error.message}\n\nDeine bisherigen Daten wurden nicht verändert.`)
  }
}

function init() {
  document.querySelectorAll('.nav-item').forEach(b=>b.addEventListener('click', ()=>showView(b.dataset.view)));
  getElement('#view-timer').addEventListener('click', handleTimerAreaClick);
  getElement('#mainTimerButton').addEventListener('click', timerAction);
  getElement('#resetButton').addEventListener('click', resetTimer);
  getElement('#finishButton').addEventListener('click', finishTimer);
  getElement('#calendarPrev').addEventListener('click', ()=> {
    calendarMonday = addDays(calendarMonday, - 7);selectedDate = addDays(selectedDate, - 7);renderCalendar()
  });
  getElement('#calendarNext').addEventListener('click', ()=> {
    calendarMonday = addDays(calendarMonday, 7);selectedDate = addDays(selectedDate, 7);renderCalendar()
  });
  getElement('#addManualButton').addEventListener('click', ()=> {
    const now = new Date();
    const start = new Date(selectedDate);
    start.setHours(now.getHours() - 1, now.getMinutes(), 0, 0);
    const end = new Date(start.getTime() + 3600000);
    openEntry({
      start: + start, end: + end, categoryId:null, extras:[], note:''
    })
  });
  getElement('#periodSelect').addEventListener('change', renderAnalysis);
  getElement('#analysisAddGroup').addEventListener('click', () => {
    analysisGroups.push([]);
    refreshAnalysisFilters();
    getElement('#analysisGroups').lastElementChild.querySelector('.extra-add-button').click();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !getElement('#entryDialog').open) setFocusMode(false);
  });
  getElement('#startDate').addEventListener('change', renderAnalysis);
  getElement('#endDate').addEventListener('change', renderAnalysis);
  getElement('#entryForm').addEventListener('submit', saveEntry);
  getElement('#addExtraButton').addEventListener('click', ()=>toggleExtraPicker(getElement('#extraPicker').classList.contains('hidden')));
  getElement('#extraSearch').addEventListener('input', renderExtraSuggestions);
  getElement('#extraSearch').addEventListener('keydown', e=> {
    if(e.key === 'Escape') {
      e.preventDefault();toggleExtraPicker(false)
    }
    if(e.key === 'Enter') {
      e.preventDefault();const first = getElement('#extraSuggestions button');if(first)first.click()
    }
  });
  getElement('#closeDialog').addEventListener('click', closeEntry);
  getElement('#entryDialog').addEventListener('cancel', e=> {
    e.preventDefault();closeEntry()
  });
  getElement('#mainLabel').addEventListener('change', ()=>getElement('#newCategoryFields').classList.toggle('hidden', getElement('#mainLabel').value !== 'new'));
  getElement('#deleteEntry').addEventListener('click', deleteEntry);
  getElement('#exportButton').addEventListener('click', exportData);
  getElement('#importButton').addEventListener('click', ()=>getElement('#importFile').click());
  getElement('#importFile').addEventListener('change', importData);
  getElement('#startDate').value = dayKey(startOfWeek(new Date()));
  getElement('#endDate').value = dayKey(new Date());
  renderAll();
  timerTick = setInterval(()=> {
    if(data.timer.mode === 'running')updateTimer();const today = dayKey(new Date());if(today !== init.lastDay) {
      init.lastDay = today;renderCalendar();renderAnalysis()
    }
  }, 1000);
  init.lastDay = dayKey(new Date());
  document.addEventListener('visibilitychange', ()=> {
    if(!document.hidden) {
      updateTimer();renderCalendar();renderAnalysis()
    }
  });
  if('serviceWorker' in navigator && location.protocol !== 'file:')navigator.serviceWorker.register('./sw.js').catch(console.warn)
}

init();
